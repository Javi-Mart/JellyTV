import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { configureControl } from './browser-control.mjs';

const credentials = JSON.parse(await readFile('.lab/credentials.local.json', 'utf8'));
const fixtures = JSON.parse(await readFile('.lab/extended-fixtures.local.json', 'utf8'));
assert.equal(credentials.baseURL, 'http://127.0.0.1:18996');
const server = await fetch(credentials.baseURL + '/System/Info/Public').then(response => response.json());
assert.equal(server.Id, credentials.serverId);
assert.equal(server.Version, '12.2.0');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const report = { date: new Date().toISOString(), server: server.Version, browser: browser.version(),
  protocol: 'Three native controls with empty Branding and no Enhanced plugin. Select second real AAC track, wait for playback, pause and return using native Back. Record every console error and uncaught exception.', runs: [] };
try {
  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({ storageState: '.lab/auth/limited.local.json', baseURL: credentials.baseURL, viewport: { width: 1920, height: 1080 } });
    await configureControl(context, 'baseline');
    const page = await context.newPage();
    const errors = [], exceptions = [];
    let stage = 'detail';
    page.on('pageerror', error => exceptions.push(error.message));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const source = message.location().url;
      errors.push({ message: message.text(), source: source ? new URL(source).pathname : '', stage, route: page.url().split('#')[1] || '' });
    });
    await page.goto('/web/#/details?id=' + fixtures.movie);
    await page.locator('.btnPlay:visible').click();
    const video = page.locator('video');
    await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThan(0.2);
    stage = 'switch';
    await page.mouse.move(100, 100);
    await page.locator('.btnAudio:visible').click();
    await page.getByRole('button', { name: 'High tone - Spanish - AAC - Mono', exact: true }).click();
    await expect.poll(() => video.evaluate(node => node.readyState)).toBeGreaterThanOrEqual(2);
    const before = await video.evaluate(node => node.currentTime);
    await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThan(before + 0.2);
    stage = 'pause';
    await page.keyboard.press('k');
    await expect.poll(() => video.evaluate(node => node.paused)).toBe(true);
    stage = 'return';
    await page.mouse.move(130, 100);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('.btnPlay:visible')).toBeVisible();
    await page.waitForTimeout(500);
    const disabled = await page.evaluate(() => ({ core: getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() === '', enhanced: typeof window.JellyTVEnhanced === 'undefined' && !document.querySelector('.jellytv-hero') }));
    assert.deepEqual(disabled, { core: true, enhanced: true });
    assert.deepEqual(exceptions, []);
    report.runs.push({ disabled, errors, exceptions, playbackAdvanced: true, nativeReturn: true });
    await context.close();
  }
  await writeFile('docs/validation/upstream-audio.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
