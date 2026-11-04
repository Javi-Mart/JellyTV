import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, writeFile, mkdtemp, mkdir, rm, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fixScrollOptions } from '../../scripts/fix-scroll-options.mjs';

const spec = JSON.parse(await readFile(new URL('../../web-compat/scroll-options-10.10.6.json', import.meta.url), 'utf8'));
const fixture = await readFile(new URL('../fixtures/main-web-10.10.6.bundle.fixture', import.meta.url));
async function lab(run) {
  const parent = resolve('.lab/unit-fixtures');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'jellytv-scroll-test-'));
  await writeFile(join(root, spec.file), fixture);
  try { await run(root); } finally {
    const target = await realpath(root);
    assert.ok(target.startsWith(parent + sep + 'jellytv-scroll-test-') && target === resolve(root));
    await rm(target, { recursive: true });
  }
}

test('10.10.6 scroll-options patch is pinned, previewable, idempotent and byte-reversible', () => lab(async root => {
  assert.equal((await fixScrollOptions({ root, action: 'apply', dryRun: true })).state, 'ORIGINAL');
  assert.deepEqual(await readFile(join(root, spec.file)), fixture);
  assert.equal((await fixScrollOptions({ root, action: 'apply' })).sha256, spec.patchedSha256);
  assert.equal((await fixScrollOptions({ root, action: 'apply' })).state, 'PATCHED');
  assert.equal((await fixScrollOptions({ root, action: 'revert' })).sha256, spec.originalSha256);
  assert.deepEqual(await readFile(join(root, spec.file)), fixture);
  await writeFile(join(root, spec.file), Buffer.concat([fixture, Buffer.from('\n// another build')]));
  await assert.rejects(fixScrollOptions({ root, action: 'apply' }), /Unknown or edited/);
}));

test('scroll-options patch preserves unrelated files after a changed backup or temporary', () => lab(async root => {
  await writeFile(join(root, '.jellytv-scroll-options-10.10.6.tmp'), 'unknown bytes');
  await assert.rejects(fixScrollOptions({ root, action: 'apply' }), /Unknown temporary/);
  assert.deepEqual(await readFile(join(root, spec.file)), fixture);
  await rm(join(root, '.jellytv-scroll-options-10.10.6.tmp'));
  await fixScrollOptions({ root, action: 'apply' });
  await writeFile(join(root, '.jellytv-scroll-options-10.10.6.original'), 'changed');
  await assert.rejects(fixScrollOptions({ root, action: 'revert' }), /Backup has been edited/);
}));

test('the repaired feature probe preserves support detection and passes a valid behavior', () => {
  const source = fixture.toString('utf8').replace(spec.before, spec.after);
  const start = source.indexOf('var u=270,c=1e-6,d="scrollBehavior"');
  const end = source.indexOf('function y(', start);
  assert.ok(start > 0 && end > start, 'Reviewed scrollManager feature probe is present');
  const calls = [];
  const context = vm.createContext({ document: {
    documentElement: { style: { scrollBehavior: '' } },
    createElement() { return { scrollTo(options) { calls.push(options.behavior); } }; }
  } });
  vm.runInContext(source.slice(start, end), context);
  assert.equal(context.f, true);
  assert.deepEqual(calls, ['auto']);
});
