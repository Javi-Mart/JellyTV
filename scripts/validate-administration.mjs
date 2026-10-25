import { compatibilityEvidence } from './lab/compatibility-evidence.mjs';
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { configureControl } from './lab/browser-control.mjs';

const credentials = JSON.parse(await readFile('.lab/credentials.local.json', 'utf8'));
assert.equal(credentials.baseURL, 'http://127.0.0.1:18996');
const server = await fetch(credentials.baseURL + '/System/Info/Public').then(response => response.json());
assert.equal(server.Id, credentials.serverId);
const browser = await chromium.launch({ executablePath: process.env.JELLYTV_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const report = { date: new Date().toISOString(), browser: browser.version(), server: server.Version, method: 'Browser-local differential control; no server preferences or data are modified', runs: [] };
report.hostCompatibility = await compatibilityEvidence();

try {
  for (const mode of ['baseline', 'enhanced']) {
    const context = await browser.newContext({ baseURL: credentials.baseURL, storageState: '.lab/auth/admin.local.json', viewport: { width: 1366, height: 768 } });
    await configureControl(context, mode);
    const page = await context.newPage();
    const errors = [], exceptions = [];
    page.on('console', message => {
      if (message.type() === 'error') errors.push({ message: message.text(), route: page.url().split('#')[1], source: message.location().url?.split('/').at(-1) });
    });
    page.on('pageerror', error => exceptions.push(error.message));
    await page.addInitScript(() => {
      window.__adminRejections = [];
      addEventListener('unhandledrejection', event => window.__adminRejections.push(String(event.reason)));
    });
    await page.goto('/web/#/home');
    await expect(page.locator('.jellytv-hero')).toHaveCount(mode === 'enhanced' ? 1 : 0);
    await page.getByRole('button', { name: 'User Menu' }).click();
    await page.getByRole('menuitem', { name: 'Dashboard', exact: true }).click();
    await expect(page).toHaveURL(/#\/dashboard/);
    const pages = [];
    async function record(name) {
      await expect(page.locator('.jellytv-hero')).toHaveCount(0);
      const geometry = await page.evaluate(() => ({ core: getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim(), viewport: document.documentElement.clientWidth, width: document.documentElement.scrollWidth }));
      assert.equal(geometry.core, '');
      assert.ok(geometry.width <= geometry.viewport + 1);
      pages.push(name);
    }
    await expect(page.getByRole('button', { name: 'Scan All Libraries', exact: true })).toBeVisible();
    await record('Dashboard');
    await page.getByRole('link', { name: 'Users', exact: true }).click();
    await expect(page.getByText(credentials.limited.username, { exact: true }).first()).toBeVisible();
    await record('Users');
    await page.getByRole('button', { name: 'Libraries', exact: true }).click();
    await page.getByRole('link', { name: 'Libraries', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add Media Library', exact: true })).toBeVisible();
    await record('Libraries');
    await page.getByRole('link', { name: 'Plugins', exact: true }).click();
    await page.getByRole('button', { name: 'Installed', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Manage Repositories', exact: true })).toBeVisible();
    await record('Plugins');
    assert.deepEqual(exceptions, []);
    assert.deepEqual(await page.evaluate(() => window.__adminRejections), []);
    report.runs.push({ mode, pages, errors, exceptions, unhandledRejections: 0 });
    await context.close();
  }
  assert.deepEqual(report.runs[1].errors, report.runs[0].errors, 'No new console error may be introduced by JellyTV');
  report.status = 'PASS: four admin screens usable and no JellyTV overrides or additional errors; reproduced upstream console errors are retained below';
  await mkdir('docs/validation', { recursive: true });
  await writeFile('docs/validation/administration.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
