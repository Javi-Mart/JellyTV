import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, rm, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fixQuickConnect } from '../../scripts/fix-quick-connect.mjs';

const spec = JSON.parse(await readFile(new URL('../../web-compat/quick-connect.json', import.meta.url), 'utf8'));
const fixture = await readFile(new URL('../fixtures/login-web-12.2.chunk.fixture', import.meta.url));
async function lab(run) {
  const parent = resolve('.lab/unit-fixtures');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'jellytv-quick-test-'));
  await writeFile(join(root, spec.file), fixture);
  try { await run(root); } finally {
    const target = await realpath(root);
    assert.ok(target.startsWith(parent + sep + 'jellytv-quick-test-') && target === resolve(root));
    await rm(target, { recursive: true });
  }
}

test('Quick Connect patch dry-run, apply and revert preserve the exact original bytes', () => lab(async root => {
  assert.equal((await fixQuickConnect({ root, action: 'apply', dryRun: true })).state, 'ORIGINAL');
  assert.deepEqual(await readFile(join(root, spec.file)), fixture);
  assert.equal((await fixQuickConnect({ root, action: 'apply' })).state, 'PATCHED');
  assert.equal((await fixQuickConnect({ root, action: 'apply' })).state, 'PATCHED');
  assert.equal((await fixQuickConnect({ root, action: 'revert' })).state, 'ORIGINAL');
  assert.equal((await fixQuickConnect({ root, action: 'revert' })).state, 'ORIGINAL');
  assert.deepEqual(await readFile(join(root, spec.file)), fixture);
}));

test('Quick Connect patch rejects unknown bundles and preserves subsequent user edits', () => lab(async root => {
  await fixQuickConnect({ root, action: 'apply' });
  const edited = Buffer.concat([await readFile(join(root, spec.file)), Buffer.from('\n// user edit')]);
  await writeFile(join(root, spec.file), edited);
  await assert.rejects(fixQuickConnect({ root, action: 'revert' }), /Unknown or edited/);
  assert.deepEqual(await readFile(join(root, spec.file)), edited);
}));

test('Quick Connect patch refuses edited backups and unknown interrupted-write files', () => lab(async root => {
  await writeFile(join(root, '.jellytv-quick-connect.tmp'), 'unrelated');
  await assert.rejects(fixQuickConnect({ root, action: 'apply' }), /Unknown temporary/);
  assert.deepEqual(await readFile(join(root, spec.file)), fixture);
  await rm(join(root, '.jellytv-quick-connect.tmp'));
  await fixQuickConnect({ root, action: 'apply' });
  await writeFile(join(root, '.jellytv-quick-connect.original'), 'edited');
  await assert.rejects(fixQuickConnect({ root, action: 'revert' }), /Backup has been edited/);
}));
