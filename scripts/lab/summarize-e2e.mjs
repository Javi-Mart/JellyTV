import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { stripVTControlCharacters } from 'node:util';
import { compatibilityEvidence } from './compatibility-evidence.mjs';

// Export only an allowlist of evidence; traces, raw error strings and sessions stay private.
const [name, resultPath = 'test-results/results.json'] = process.argv.slice(2);
if (!name || !/^[a-z0-9-]+$/.test(name)) throw new Error('Usage: node scripts/lab/summarize-e2e.mjs <evidence-name> [results.json]');
const input = JSON.parse(await readFile(resultPath, 'utf8'));
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
const tests = [];
const versions = new Set();
const browsers = new Set();
function attachment(result, name) {
  const item = result.attachments?.find(value => value.name === name);
  if (!item?.body) return null;
  try { return JSON.parse(Buffer.from(item.body, 'base64').toString('utf8')); } catch { return null; }
}
function visit(suite) {
  for (const spec of suite.specs || []) {
    for (const item of spec.tests || []) {
      const result = item.results.at(-1);
      const environment = attachment(result, 'environment');
      if (environment?.browserVersion) versions.add(environment.browserVersion);
      if (environment?.browser) browsers.add(environment.browser);
      const diagnostics = attachment(result, 'browser-diagnostics');
      const accessibility = attachment(result, 'accessibility');
      tests.push({
        project: item.projectName,
        title: spec.title,
        status: item.status,
        durationMs: result?.duration,
        diagnostics: diagnostics ? { unexpected: diagnostics.unexpected.length, upstream: diagnostics.upstream.length, unhandledRejections: diagnostics.rejections.length } : null,
        accessibility: accessibility?.map(violation => ({ id: violation.id, impact: violation.impact, affectedNodes: violation.nodes.length })),
        dpad: attachment(result, 'dpad'),
        failureKind: result?.errors?.length ? stripVTControlCharacters(result.errors[0].message || '').split('\n')[0].slice(0,180) : undefined
      });
    }
  }
  for (const child of suite.suites || []) visit(child);
}
visit(input);
const summary = { schema: 1, name, serverVersion: '12.2.0', browsers: [...browsers], browserVersions: [...versions], startTime: input.stats.startTime, durationMs: input.stats.duration, counts: { passed: input.stats.expected, failed: input.stats.unexpected, skipped: input.stats.skipped, flaky: input.stats.flaky, setupFailures: input.errors?.length || 0 }, setupFailureKinds: input.errors?.map(error => stripVTControlCharacters(error.message || '').split('\n')[0].slice(0,180)), build: manifest, tests };
await mkdir('docs/validation', { recursive: true });
summary.hostCompatibility = await compatibilityEvidence();
await writeFile(`docs/validation/${name}.json`, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ path: `docs/validation/${name}.json`, counts: summary.counts, browsers: summary.browsers, versions: summary.browserVersions }));
