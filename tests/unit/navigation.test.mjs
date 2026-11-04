import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, rm, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fixNavigation } from '../../scripts/fix-navigation.mjs';

test('navigation cancellation patch applies only to its pinned bundle and restores exact bytes', async () => {
  const spec = JSON.parse(await readFile(new URL('../../web-compat/navigation.json', import.meta.url), 'utf8'));
  const fixture = await readFile(new URL('../fixtures/main-web-12.2.bundle.fixture', import.meta.url));
  const parent = resolve('.lab/unit-fixtures');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'jellytv-navigation-test-'));
  try {
    await writeFile(join(root, spec.file), fixture);
    assert.equal((await fixNavigation({ root, action: 'apply', dryRun: true })).state, 'ORIGINAL');
    assert.deepEqual(await readFile(join(root, spec.file)), fixture);
    assert.equal((await fixNavigation({ root, action: 'apply' })).sha256, spec.patchedSha256);
    assert.equal((await fixNavigation({ root, action: 'apply' })).state, 'PATCHED');
    assert.equal((await fixNavigation({ root, action: 'revert' })).sha256, spec.originalSha256);
    assert.deepEqual(await readFile(join(root, spec.file)), fixture);
    await writeFile(join(root, spec.file), Buffer.concat([fixture, Buffer.from('\n// user change')]));
    await assert.rejects(fixNavigation({ root, action: 'apply' }), /Unknown or edited/);
  } finally {
    const target = await realpath(root);
    assert.ok(target.startsWith(parent + sep + 'jellytv-navigation-test-') && target === resolve(root));
    await rm(target, { recursive: true });
  }
});
