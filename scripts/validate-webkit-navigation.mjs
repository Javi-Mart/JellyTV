import { webkit, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { configureControl } from './lab/browser-control.mjs';

const credentials = JSON.parse(await readFile('.lab/credentials.local.json', 'utf8'));
if (credentials.baseURL !== 'http://127.0.0.1:18996') throw new Error('Only the isolated lab is allowed');
const records = [];
const browser = await webkit.launch();
try {
  for (const mode of ['baseline', 'enhanced']) {
    for (let repetition = 1; repetition <= 5; repetition++) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 }, hasTouch: true,
        storageState: '.lab/auth/limited.local.json'
      });
      await configureControl(context, mode);
      const page = await context.newPage();
      const record = { mode, repetition, crashed: false, pageErrors: [], result: 'PASS' };
      page.on('crash', () => { record.crashed = true; });
      page.on('pageerror', error => record.pageErrors.push(error.message));
      try {
        await page.goto(credentials.baseURL + '/web/#/home');
        await expect(page.getByText('My Media', { exact: true })).toBeVisible();
        const library = credentials.views.find(view => view.CollectionType === 'movies');
        await page.locator(`#homeTab [data-id="${library.Id}"] a`).first().click();
        await expect(page.locator(`.card[data-id="${credentials.items['Movie:The Quiet Horizon']}"]:visible`).first()).toBeVisible();
        await page.screenshot({ animations: 'disabled' });
        await page.goto(credentials.baseURL + '/web/#/search');
        await page.locator('#searchTextInput').fill('Quiet Horizon');
        await expect(page.locator(`a[href*="id=${credentials.items['Movie:The Quiet Horizon']}"]:visible`).first()).toBeVisible();
      } catch (error) {
        record.result = 'FAIL';
        record.failure = error.message.split('\n')[0];
      } finally {
        records.push(record);
        await context.close();
      }
    }
  }
} finally { await browser.close(); }
const report = {
  schema: 1, checkedAt: new Date().toISOString(), browser: 'WebKit',
  browserVersion: browser.version(), serverVersion: '12.2.0',
  protocol: 'Five separate mobile touch contexts per mode, Home → movie library → screenshot → Search → query; same routed network behavior.',
  build: JSON.parse(await readFile('dist/manifest.json', 'utf8')),
  records,
  result: records.every(record => record.result === 'PASS' && !record.crashed && record.pageErrors.length === 0) ? 'PASS' : 'FAIL',
  limitation: 'A passing repeat does not erase an earlier transient crash or certify Safari on Apple hardware.'
};
await writeFile('docs/validation/webkit-navigation.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ result: report.result, records: records.length, failures: records.filter(record => record.result !== 'PASS') }));
expect(report.result).toBe('PASS');
