import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access, mkdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { install } from '../../scripts/install.mjs';
import { fixScrollOptions } from '../../scripts/fix-scroll-options.mjs';

async function fixture(t) {
  const base = resolve('.lab/unit-fixtures');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'install-1010-'));
  t.after(() => {
    if (!resolve(root).startsWith(base + sep)) throw new Error('Invalid fixture cleanup path');
    return rm(root, { recursive: true, force: true });
  });
  await writeFile(join(root, 'index.html'), '<!DOCTYPE html><html><head><script defer src="main.jellyfin.bundle.js"></script></head><body></body></html>');
  await writeFile(join(root, 'config.json'), JSON.stringify({ plugins: ['htmlVideoPlayer/plugin'], menuLinks: [{ name: 'Preserve', url: '/help' }] }));
  await writeFile(join(root, 'main.jellyfin.bundle.js'), await readFile(new URL('../fixtures/main-web-10.10.6.bundle.fixture', import.meta.url)));
  return root;
}

test('10.10.6 integration loads before the native plugin manager and restores byte-identical originals', async t => {
  const root = await fixture(t);
  const before = await readFile(join(root, 'index.html'));
  const config = await readFile(join(root, 'config.json'));
  const native = await readFile(join(root, 'main.jellyfin.bundle.js'));
  await install({ action: 'install', root, webVersion: '10.10.6', dryRun: true });
  assert.deepEqual(await readFile(join(root, 'index.html')), before);
  await assert.rejects(access(join(root, '.jellytv-install.json')));
  await install({ action: 'install', root, webVersion: '10.10.6' });
  const html = await readFile(join(root, 'index.html'), 'utf8');
  assert.ok(html.indexOf('jellytv-enhanced.js') < html.indexOf('main.jellyfin.bundle.js'));
  assert.deepEqual(JSON.parse(await readFile(join(root, 'config.json'))).plugins, ['htmlVideoPlayer/plugin', 'JellyTVEnhanced']);
  await assert.rejects(install({ action: 'update', root, webVersion: '12.2' }), /Web version changed/);
  await install({ action: 'uninstall', root });
  assert.deepEqual(await readFile(join(root, 'index.html')), before);
  assert.deepEqual(await readFile(join(root, 'config.json')), config);
  assert.deepEqual(await readFile(join(root, 'main.jellyfin.bundle.js')), native);
});

test('10.10.6 accepts the reviewed scroll-options correction but refuses other web bytes', async t => {
  const root = await fixture(t);
  await fixScrollOptions({ root, action: 'apply' });
  await install({ action: 'install', root, webVersion: '10.10.6', dryRun: true });
  const before = await readFile(join(root, 'index.html'));
  await writeFile(join(root, 'main.jellyfin.bundle.js'), 'unknown web version');
  await assert.rejects(install({ action: 'install', root, webVersion: '10.10.6' }), /Unknown Jellyfin Web/);
  assert.deepEqual(await readFile(join(root, 'index.html')), before);
  await assert.rejects(access(join(root, '.jellytv-install.json')));
});
