import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { configureControl } from './browser-control.mjs';

const credentials = JSON.parse(await readFile('.lab/credentials.local.json', 'utf8'));
assert.equal(credentials.baseURL, 'http://127.0.0.1:18996');
const server = await fetch(credentials.baseURL + '/System/Info/Public').then(response => response.json());
assert.equal(server.Id, credentials.serverId);
assert.equal(server.Version, '12.2.0');
const browser = await chromium.launch({ executablePath: process.env.JELLYTV_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const report = { date: new Date().toISOString(), server: server.Version, browser: browser.version(), protocol: 'Twelve fresh native login/logout sessions: pointer/keyboard at normal CPU and 4x CPU slowdown. Empty CustomCss, no Enhanced plugin; no second login that could interrupt native logout. Slowdown probes the native asynchronous logout race independently of styling.', runs: [] };
try {
  for (const { input, cpuSlowdown } of [1, 4].flatMap(cpuSlowdown => ['pointer', 'keyboard', 'pointer', 'keyboard', 'pointer', 'keyboard'].map(input => ({ input, cpuSlowdown })))) {
    const context = await browser.newContext({ baseURL: credentials.baseURL, viewport: { width: 1366, height: 768 } });
    await configureControl(context, 'baseline');
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown });
    const errors = [], exceptions = [], unauthorized = [];
    let stage = 'initial-login';
    page.on('pageerror', error => exceptions.push(error.message));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const source = message.location().url;
      errors.push({ message: message.text(), source: source ? new URL(source).pathname : '', stage, route: page.url().split('#')[1] || '' });
    });
    page.on('response', response => {
      if (response.status() === 401) unauthorized.push({ path: new URL(response.url()).pathname, stage });
    });
    await page.goto('/web/#/login');
    await page.locator('#txtManualName').fill(credentials.limited.username);
    await page.locator('#txtManualPassword').fill(credentials.limited.password);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByText('My Media', { exact: true })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'User Menu' }).click();
    await page.waitForLoadState('networkidle');
    stage = 'logout';
    const signOut = page.getByRole('menuitem', { name: 'Sign Out', exact: true });
    if (input === 'keyboard') await signOut.press('Enter');
    else await signOut.click();
    await expect(page.locator('#txtManualName')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const disabled = await page.evaluate(() => ({ core: getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() === '', enhanced: typeof window.JellyTVEnhanced === 'undefined' && !document.querySelector('.jellytv-hero') }));
    assert.deepEqual(disabled, { core: true, enhanced: true });
    assert.deepEqual(exceptions, []);
    report.runs.push({ input, cpuSlowdown, disabled, errors, unauthorized, exceptions });
    await context.close();
  }
  await writeFile('docs/validation/upstream-logout.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.runs.map(run => ({ input: run.input, unauthorized: run.unauthorized }))));
} finally { await browser.close(); }
