import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { configureControl } from './browser-control.mjs';
import { compatibilityEvidence } from './compatibility-evidence.mjs';

const credentials = JSON.parse(await readFile('.lab/credentials.local.json', 'utf8'));
assert.equal(credentials.baseURL, 'http://127.0.0.1:18996');
const browser = await chromium.launch({ executablePath: process.env.JELLYTV_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const report = { date: new Date().toISOString(), browser: browser.version(),
  protocol: 'Real SPA navigation, Back immediately after URL change, 300 ms delayed itemDetails controller download with unchanged bytes; wait 1 second before inspecting both native pages. Theme-disable controls only alter Branding/config/theme assets. No DOM or media-data replacement.',
  build: JSON.parse(await readFile('dist/manifest.json', 'utf8')), hostCompatibility: await compatibilityEvidence(), runs: [] };
try {
  for (const mode of ['baseline', 'core', 'enhanced']) {
    for (let repetition = 1; repetition <= 2; repetition++) {
      const context = await browser.newContext({ baseURL: credentials.baseURL, storageState: '.lab/auth/limited.local.json', viewport: { width: 1366, height: 768 } });
      await configureControl(context, mode);
      let delayed = false;
      await context.route('**/*itemDetails*', async route => {
        delayed = true;
        await new Promise(resolve => setTimeout(resolve, 300));
        await route.continue();
      });
      const page = await context.newPage();
      await page.goto('/web/#/home');
      await expect(page.getByText('My Media', { exact: true })).toBeVisible();
      await page.evaluate(id => { location.hash = '#/details?id=' + id; }, credentials.items['Series:The Meridian Archive']);
      await expect(page).toHaveURL(/#\/details/);
      await page.goBack();
      await expect(page).toHaveURL(/#\/home/);
      await page.waitForTimeout(1000);
      const state = { homeVisible: await page.locator('#indexPage:visible').count(), detailVisible: await page.locator('#itemDetailPage:visible').count() };
      report.runs.push({ mode, repetition, delayed, ...state, overlap: Boolean(state.homeVisible && state.detailVisible) });
      await context.close();
    }
  }
} finally { await browser.close(); }
await writeFile('docs/validation/navigation-race.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.runs));
assert.ok(report.runs.every(run => run.delayed && run.homeVisible === 1 && run.detailVisible === 0), 'A discarded navigation must never display its late view');
