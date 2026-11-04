import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, writeFile, mkdtemp, mkdir, rm, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fixQuickConnect1010 } from '../../scripts/fix-quick-connect-10.10.6.mjs';

const spec = JSON.parse(await readFile(new URL('../../web-compat/quick-connect-10.10.6.json', import.meta.url)));
const fixture = await readFile(new URL('../fixtures/login-web-10.10.6.chunk.fixture', import.meta.url));
async function lab(run) {
  const parent = resolve('.lab/unit-fixtures'); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'quick1010-'));
  await writeFile(join(root, spec.file), fixture);
  try { await run(root); } finally {
    const target = await realpath(root);
    assert.ok(target.startsWith(parent + sep + 'quick1010-') && target === resolve(root));
    await rm(target, { recursive: true });
  }
}

test('10.10.6 Quick Connect correction supports preview, idempotence and exact restoration', () => lab(async root => {
  assert.equal((await fixQuickConnect1010({ root, action: 'apply', dryRun: true })).state, 'ORIGINAL');
  assert.deepEqual(await readFile(join(root, spec.file)), fixture);
  assert.equal((await fixQuickConnect1010({ root, action: 'apply' })).sha256, spec.patchedSha256);
  assert.equal((await fixQuickConnect1010({ root, action: 'apply' })).state, 'PATCHED');
  assert.equal((await fixQuickConnect1010({ root, action: 'revert' })).sha256, spec.originalSha256);
  assert.deepEqual(await readFile(join(root, spec.file)), fixture);
}));

test('10.10.6 Quick Connect correction preserves unknown upstream bytes and user edits', () => lab(async root => {
  const unknown = Buffer.concat([fixture, Buffer.from('\n// local edit')]);
  await writeFile(join(root, spec.file), unknown);
  await assert.rejects(fixQuickConnect1010({ root, action: 'apply' }), /Unknown or edited/);
  assert.deepEqual(await readFile(join(root, spec.file)), unknown);
}));

test('10.10.6 Quick Connect correction refuses altered backup and unrelated temporary', () => lab(async root => {
  const temporary = join(root, '.jellytv-quick-connect-10.10.6.tmp');
  await writeFile(temporary, 'unrelated');
  await assert.rejects(fixQuickConnect1010({ root, action: 'apply' }), /Unknown temporary/);
  assert.deepEqual(await readFile(join(root, spec.file)), fixture);
  await rm(temporary); await fixQuickConnect1010({ root, action: 'apply' });
  await writeFile(join(root, '.jellytv-quick-connect-10.10.6.original'), 'edited');
  await assert.rejects(fixQuickConnect1010({ root, action: 'revert' }), /Backup has been edited/);
}));

test('10.10.6 Quick Connect handles expected dismissal but propagates unexpected rejection', async () => {
  const evaluate = reason => vm.runInNewContext(spec.after, {
    g: { A: () => Promise.reject(reason) }, h: { Ay: { translate: () => 'test' } }, r: { Code: 'test' }
  });
  assert.equal(await evaluate(undefined), undefined);
  const failure = new Error('unexpected dialog failure');
  await assert.rejects(evaluate(failure), error => error === failure);
});
