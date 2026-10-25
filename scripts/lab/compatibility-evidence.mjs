import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

export async function compatibilityEvidence(baseURL = 'http://127.0.0.1:18996') {
  assert.equal(baseURL, 'http://127.0.0.1:18996');
  const records = [];
  for (const name of ['quick-connect', 'navigation']) {
    const spec = JSON.parse(await readFile(new URL(`../../web-compat/${name}.json`, import.meta.url), 'utf8'));
    const response = await fetch(baseURL + '/web/' + spec.file);
    assert.ok(response.ok);
    const sha256 = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
    assert.equal(sha256, spec.patchedSha256, `Served ${name} correction differs from the reviewed bundle`);
    records.push({ patch: name, file: spec.file, sha256 });
  }
  return records;
}
