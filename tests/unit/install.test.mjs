import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access, mkdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { install } from '../../scripts/install.mjs';

async function fixture(t) {
  const base = resolve('.lab/unit-fixtures');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'install-'));
  t.after(() => {
    if (!resolve(root).startsWith(base + sep)) throw new Error('Invalid fixture cleanup path');
    return rm(root, { recursive: true, force: true });
  });
  await writeFile(join(root, 'index.html'), '<!DOCTYPE html><html><head><script defer src="main.js"></script></head><body></body></html>');
  await writeFile(join(root, 'config.json'), JSON.stringify({ plugins: ['plugins/native-player'], menuLinks: [{ name: 'Keep', url: '/help' }] }));
  return root;
}
test('install is previewable and uninstall restores byte-identical originals', async t => {
  const root = await fixture(t);
  const before = await readFile(join(root, 'index.html'));
  const config = await readFile(join(root, 'config.json'));
  await install({ action: 'install', root, webVersion: '12.2', dryRun: true });
  assert.deepEqual(await readFile(join(root, 'index.html')), before);
  await assert.rejects(access(join(root, '.jellytv-install.json')));
  await install({ action: 'install', root, webVersion: '12.2' });
  const html = await readFile(join(root, 'index.html'), 'utf8');
  assert.ok(html.indexOf('jellytv-enhanced.js') < html.indexOf('main.js'));
  const updated = JSON.parse(await readFile(join(root, 'config.json')));
  assert.deepEqual(updated.plugins, ['plugins/native-player', 'JellyTVEnhanced']);
  assert.equal(updated.menuLinks[0].name, 'Keep');
  await install({ action: 'uninstall', root });
  assert.deepEqual(await readFile(join(root, 'index.html')), before);
  assert.deepEqual(await readFile(join(root, 'config.json')), config);
});
test('tampered or updated upstream files are never silently overwritten', async t => {
  const root = await fixture(t);
  await install({ action: 'install', root, webVersion: '12.2' });
  await writeFile(join(root, 'config.json'), '{"plugins":[],"newServerSetting":true}');
  await assert.rejects(install({ action: 'uninstall', root }), /Refusing to overwrite changed file/);
  assert.equal(JSON.parse(await readFile(join(root, 'config.json'))).newServerSetting, true);
});
test('update can roll back the previous JellyTV installation', async t => {
  const root = await fixture(t);
  await install({ action: 'install', root, webVersion: '12.2' });
  const before = await readFile(join(root, '.jellytv-install.json'), 'utf8');
  await install({ action: 'update', root, webVersion: '12.2' });
  await install({ action: 'rollback', root });
  assert.deepEqual(JSON.parse(await readFile(join(root, '.jellytv-install.json'), 'utf8')), JSON.parse(before));
});
test('unsupported version and malformed config fail without mutations', async t => {
  const root = await fixture(t);
  const before = await readFile(join(root, 'index.html'));
  await assert.rejects(install({ action: 'install', root, webVersion: '10.11' }), /Only verified web version/);
  await writeFile(join(root, 'config.json'), '{"plugins":"incorrect"}');
  await assert.rejects(install({ action: 'install', root, webVersion: '12.2' }), /plugins array/);
  assert.deepEqual(await readFile(join(root, 'index.html')), before);
});

async function interruptedInstall(t) {
  const root = await fixture(t);
  const names = ['index.html', 'config.json', 'jellytv/jellytv-enhanced.css', 'jellytv/jellytv-enhanced.js'];
  const before = { 'index.html': (await readFile(join(root, names[0]))).toString('base64'), 'config.json': (await readFile(join(root, names[1]))).toString('base64'), [names[2]]: null, [names[3]]: null };
  await install({ action: 'install', root, webVersion: '12.2' });
  const after = Object.fromEntries(await Promise.all(names.map(async name => [name, (await readFile(join(root, name))).toString('base64')])));
  const nextManifest = (await readFile(join(root, '.jellytv-install.json'))).toString('base64');
  await writeFile(join(root, '.jellytv-recovery.json'), JSON.stringify({ schema: 1, before, after, manifest: null, nextManifest }));
  await writeFile(join(root, 'config.json'), Buffer.from(before['config.json'], 'base64'));
  await rm(join(root, '.jellytv-install.json'));
  return { root, before, after };
}

test('interrupted install recovers a mixed generation and known temporary file', async t => {
  const { root, before, after } = await interruptedInstall(t);
  await writeFile(join(root, 'index.html.jellytv-tmp'), Buffer.from(after['index.html'], 'base64'));
  assert.equal((await install({ action: 'status', root })).recoveryPending, true);
  await assert.rejects(install({ action: 'install', root, webVersion: '12.2' }), /interrupted operation/);
  await install({ action: 'recover', root, dryRun: true });
  assert.equal((await readFile(join(root, 'index.html'))).toString('base64'), after['index.html']);
  await install({ action: 'recover', root });
  for (const [name, content] of Object.entries(before)) {
    if (content === null) await assert.rejects(access(join(root, name)));
    else assert.equal((await readFile(join(root, name))).toString('base64'), content);
  }
  await assert.rejects(access(join(root, 'index.html.jellytv-tmp')));
  assert.equal((await install({ action: 'recover', root })).recovered, false);
});

test('recovery refuses later edits and retains journal for manual inspection', async t => {
  const { root } = await interruptedInstall(t);
  await writeFile(join(root, 'config.json'), '{"plugins":[],"laterEdit":true}');
  await assert.rejects(install({ action: 'recover', root }), /Refusing to recover changed file/);
  await access(join(root, '.jellytv-recovery.json'));
  assert.equal(JSON.parse(await readFile(join(root, 'config.json'))).laterEdit, true);
});

test('unknown temporary files and legacy journals fail before recovery mutates anything', async t => {
  const { root, after } = await interruptedInstall(t);
  await writeFile(join(root, 'config.json.jellytv-tmp'), 'unrelated data');
  await assert.rejects(install({ action: 'recover', root }), /unrecognized temporary file/);
  assert.equal((await readFile(join(root, 'index.html'))).toString('base64'), after['index.html']);
  await writeFile(join(root, '.jellytv-recovery.json'), '{"before":{}}');
  await assert.rejects(install({ action: 'recover', root }), /Unsupported recovery journal/);
});
