import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, writeFile, mkdtemp, mkdir, rm, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fixNavigation106 } from '../../scripts/fix-navigation-10.10.6.mjs';
import { fixScrollOptions } from '../../scripts/fix-scroll-options.mjs';

const spec = JSON.parse(await readFile(new URL('../../web-compat/navigation-10.10.6.json', import.meta.url), 'utf8'));
const scroll = JSON.parse(await readFile(new URL('../../web-compat/scroll-options-10.10.6.json', import.meta.url), 'utf8'));
const fixture = await readFile(new URL('../fixtures/main-web-10.10.6.bundle.fixture', import.meta.url));
async function lab(run) {
  const parent = resolve('.lab/unit-fixtures'); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'jellytv-navigation106-test-'));
  await writeFile(join(root, spec.file), fixture);
  try { await run(root); }
  finally {
    const target = await realpath(root);
    assert.ok(target.startsWith(parent + sep + 'jellytv-navigation106-test-') && target === resolve(root));
    await rm(target, { recursive: true });
  }
}

test('10.10.6 navigation patch enforces prerequisite, ordered reversal and exact original restoration', () => lab(async root => {
  await assert.rejects(fixNavigation106({ root, action: 'apply' }), /Unknown or edited/);
  assert.deepEqual(await readFile(join(root, spec.file)), fixture);
  await fixScrollOptions({ root, action: 'apply' });
  const before = await readFile(join(root, spec.file));
  assert.equal((await fixNavigation106({ root, action: 'apply', dryRun: true })).state, 'ORIGINAL');
  assert.deepEqual(await readFile(join(root, spec.file)), before);
  assert.equal((await fixNavigation106({ root, action: 'apply' })).sha256, spec.patchedSha256);
  assert.equal((await fixNavigation106({ root, action: 'apply' })).state, 'PATCHED');
  await assert.rejects(fixScrollOptions({ root, action: 'revert' }), /Unknown or edited/);
  assert.equal((await fixNavigation106({ root, action: 'revert' })).sha256, scroll.patchedSha256);
  assert.deepEqual(await readFile(join(root, spec.file)), before);
  await fixScrollOptions({ root, action: 'revert' });
  assert.deepEqual(await readFile(join(root, spec.file)), fixture);
}));

test('10.10.6 navigation patch refuses edited files, altered backup and unknown temporary', () => lab(async root => {
  await fixScrollOptions({ root, action: 'apply' });
  const before = await readFile(join(root, spec.file));
  await writeFile(join(root, '.jellytv-navigation-10.10.6.tmp'), 'unrelated');
  await assert.rejects(fixNavigation106({ root, action: 'apply' }), /Unknown temporary/);
  assert.deepEqual(await readFile(join(root, spec.file)), before);
  await rm(join(root, '.jellytv-navigation-10.10.6.tmp'));
  await fixNavigation106({ root, action: 'apply' });
  const patched = await readFile(join(root, spec.file));
  await writeFile(join(root, '.jellytv-navigation-10.10.6.original'), 'modified');
  await assert.rejects(fixNavigation106({ root, action: 'revert' }), /Backup has been edited/);
  assert.deepEqual(await readFile(join(root, spec.file)), patched);
  await writeFile(join(root, spec.file), Buffer.concat([patched, Buffer.from('\n/* third-party edit */')]));
  await assert.rejects(fixNavigation106({ root, action: 'apply' }), /Unknown or edited/);
}));

test('10.10.6 native effect cleanup cancels only its own outstanding view', () => {
  const source = fixture.toString('utf8').replace(scroll.before, scroll.after).replace(spec.before, spec.after);
  const log = source.indexOf('[ViewManagerPage] loading');
  const start = source.lastIndexOf('t.A=function(e){', log), end = source.indexOf('}},10989:', log);
  assert.ok(start > 0 && end > start);
  const effects = [], requests = [];
  const context = vm.createContext({ t: {}, console: { debug() {} },
    i: { useEffect(effect) { effects.push(effect()); } },
    o: { zy: () => ({ pathname: '/details', search: '?id=synthetic', state: null }), wQ: () => 'PUSH' },
    r: { rc: { Pop: 'POP' } }, f: (controller, view, options) => requests.push({ controller, view, options }) });
  vm.runInContext(source.slice(start, end + 1), context);
  context.t.A({ controller: 'itemDetails', view: 'detail' });
  assert.equal(requests.length, 1); assert.equal(requests[0].options.cancel, undefined);
  assert.equal(typeof effects[0], 'function'); effects[0]();
  assert.equal(requests[0].options.cancel, true);
  context.t.A({ controller: 'home', view: 'home' });
  assert.equal(requests[1].options.cancel, undefined);
  effects[0](); assert.equal(requests[1].options.cancel, undefined);
  effects[1](); assert.equal(requests[1].options.cancel, true);
});
