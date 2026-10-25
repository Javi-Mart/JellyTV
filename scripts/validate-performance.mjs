import { compatibilityEvidence } from './lab/compatibility-evidence.mjs';
import { chromium, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { configureControl } from './lab/browser-control.mjs';
import { isFeaturedRequest } from './lab/featured-request.mjs';

const credentials = JSON.parse(await readFile('.lab/credentials.local.json', 'utf8'));
assert.equal(credentials.baseURL, 'http://127.0.0.1:18996', 'Only the disposable loopback lab is allowed');
const server = await fetch(credentials.baseURL + '/System/Info/Public').then(response => response.json());
assert.equal(server.Id, credentials.serverId);
assert.equal(server.Version, '12.2.0');
const browser = await chromium.launch({ executablePath: process.env.JELLYTV_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const results = { schema: 1, date: new Date().toISOString(), browser: browser.version(), server: '12.2.0', viewport: { width: 1366, height: 768 }, cycles: 50, control: 'Same real server and user. Baseline browser intercepts only config/Branding/theme assets to disable JellyTV; server files and preferences remain unchanged. Routing is enabled in both contexts.', runs: [] };
results.hostCompatibility = await compatibilityEvidence();
results.build = JSON.parse(await readFile('dist/manifest.json', 'utf8'));

try {
  for (const mode of ['baseline', 'enhanced']) {
    const context = await browser.newContext({ baseURL: credentials.baseURL, storageState: '.lab/auth/limited.local.json', viewport: results.viewport });
    await configureControl(context, mode);
    const page = await context.newPage();
    const errors = [];
    let featuredBatches = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => {
      if (isFeaturedRequest(request)) featuredBatches++;
    });
    await page.addInitScript(() => {
      window.__perfEvidence = { rejections: [], longTasks: [] };
      addEventListener('unhandledrejection', event => window.__perfEvidence.rejections.push(String(event.reason)));
      new PerformanceObserver(list => window.__perfEvidence.longTasks.push(...list.getEntries().map(entry => entry.duration))).observe({ type: 'longtask', buffered: true });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const started = performance.now();
    await page.goto('/web/#/home');
    await expect(page.getByText('My Media', { exact: true })).toBeVisible();
    await expect(page.locator('.jellytv-hero')).toHaveCount(mode === 'enhanced' ? 1 : 0);
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() !== ''), mode === 'enhanced');
    const initialHomeMs = Math.round(performance.now() - started);
    async function cycle() {
      await page.evaluate(id => { location.hash = '#/details?id=' + id; }, credentials.items['Movie:The Quiet Horizon']);
      await expect(page.locator('#itemDetailPage:visible .btnPlay')).toBeVisible();
      await expect(page.locator('.jellytv-hero')).toHaveCount(0);
      // Web's native scroller transitions last 240–270 ms. Measure settled screens,
      // rather than destroying a scroller during its own deferred scroll callback.
      await page.waitForTimeout(300);
      await page.evaluate(() => { location.hash = '#/home'; });
      await expect(page.getByText('My Media', { exact: true })).toBeVisible();
      await expect(page.locator('.jellytv-hero')).toHaveCount(mode === 'enhanced' ? 1 : 0);
      await page.waitForTimeout(300);
    }
    async function metrics() {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await cdp.send('HeapProfiler.collectGarbage');
      const counters = await cdp.send('Memory.getDOMCounters');
      const metrics = (await cdp.send('Performance.getMetrics')).metrics;
      return { ...counters, jsHeapBytes: metrics.find(metric => metric.name === 'JSHeapUsedSize').value };
    }
    for (let index = 0; index < 5; index++) await cycle();
    const before = await metrics();
    const samples = [{ cycle: 0, ...before }];
    const cycleStart = performance.now();
    for (let index = 0; index < results.cycles; index++) {
      await cycle();
      if ((index + 1) % 10 === 0) samples.push({ cycle: index + 1, ...await metrics() });
    }
    const cycleDurationMs = Math.round(performance.now() - cycleStart);
    const after = await metrics();
    const evidence = await page.evaluate(() => window.__perfEvidence);
    assert.deepEqual(errors, []);
    assert.deepEqual(evidence.rejections, []);
    assert.ok(featuredBatches <= Math.ceil((performance.now() - started) / 60_000) + 1, 'Featured batches must remain bounded by the 60 second cache');
    const delta = Object.fromEntries(Object.keys(after).map(key => [key, after[key] - before[key]]));
    results.runs.push({ mode, initialHomeMs, cycleDurationMs, before, after, delta, samples, featuredBatches, consoleErrors: errors.length, unhandledRejections: evidence.rejections.length, longTasks: { count: evidence.longTasks.length, totalMs: Math.round(evidence.longTasks.reduce((sum, value) => sum + value, 0)), maxMs: Math.round(Math.max(0, ...evidence.longTasks)) } });
    console.log(JSON.stringify(results.runs.at(-1)));
    await context.close();
  }
  results.status = 'PASS: bounded lifecycle, requests and zero console/rejection failures; timings and heap deltas are observations, not a device performance guarantee';
  await mkdir('docs/validation', { recursive: true });
  await writeFile('docs/validation/performance.json', JSON.stringify(results, null, 2) + '\n');
} finally { await browser.close(); }
