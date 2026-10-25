import { compatibilityEvidence } from './lab/compatibility-evidence.mjs';
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { configureControl } from './lab/browser-control.mjs';

const credentials = JSON.parse(await readFile('.lab/credentials.local.json', 'utf8'));
assert.equal(credentials.baseURL, 'http://127.0.0.1:18996');
const server = await fetch(credentials.baseURL + '/System/Info/Public').then(response => response.json());
assert.equal(server.Id, credentials.serverId);
assert.equal(server.Version, '12.2.0');
const navigationCompatibility = await compatibilityEvidence();
const enabled = await fetch(credentials.baseURL + '/QuickConnect/Enabled').then(response => response.json());
assert.equal(enabled, true, 'Quick Connect must be enabled in the disposable lab');
const compatibility = JSON.parse(await readFile('web-compat/quick-connect.json', 'utf8'));
const loginBytes = Buffer.from(await (await fetch(credentials.baseURL + '/web/' + compatibility.file)).arrayBuffer());
assert.equal(createHash('sha256').update(loginBytes).digest('hex'), compatibility.patchedSha256, 'Reviewed Quick Connect correction must be installed');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const report = { date: new Date().toISOString(), server: server.Version, browser: browser.version(),
  build: JSON.parse(await readFile('dist/manifest.json', 'utf8')),
  navigationCompatibility, hostCompatibility: { file: compatibility.file, sha256: compatibility.patchedSha256 },
  protocol: 'Fresh baseline/Core/Enhanced contexts with the same pinned Quick Connect correction: reject nonexistent user, show error, authorize real session as the limited lab account, confirm Home and hero scope; require zero exceptions and rejections. No codes, secrets or tokens in evidence.', runs: [] };
try {
  for (const mode of ['baseline', 'core', 'enhanced']) {
    const context = await browser.newContext({ baseURL: credentials.baseURL, viewport: { width: 1366, height: 768 } });
    await configureControl(context, mode);
    const page = await context.newPage();
    const errors = [], exceptions = [];
    let stage = 'initial';
    page.on('pageerror', error => exceptions.push({ message: error.message, stage }));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const source = message.location().url;
      errors.push({ message: message.text(), source: source ? new URL(source).pathname : '', route: page.url().split('#')[1] || '' });
    });
    await page.addInitScript(() => {
      window.__authRejections = [];
      window.__authStage = 'initial';
      addEventListener('unhandledrejection', event => window.__authRejections.push({ stage: window.__authStage, reason: String(event.reason) }));
    });
    await page.goto('/web/#/login');
    await page.locator('#txtManualName').fill('jellytv-no-such-user');
    await page.locator('#txtManualPassword').fill('invalid-lab-password');
    const rejected = page.waitForResponse(response => response.request().method() === 'POST' && /\/AuthenticateByName$/i.test(new URL(response.url()).pathname));
    stage = 'invalid-login';
    await page.evaluate(() => { window.__authStage = 'invalid-login'; });
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    assert.equal((await rejected).status(), 401);
    await expect(page.getByText('Invalid username or password. Please try again.', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/#\/login/);
    const initiated = page.waitForResponse(response => new URL(response.url()).pathname === '/QuickConnect/Initiate');
    stage = 'quick-connect';
    await page.evaluate(() => { window.__authStage = 'quick-connect'; });
    await page.locator('.btnQuick').click();
    const invitation = await (await initiated).json();
    assert.match(invitation.Code, /^\d+$/);
    await expect(page.locator('#quickConnectAlert')).toBeVisible();
    const authorized = await fetch(credentials.baseURL + '/QuickConnect/Authorize?code=' + invitation.Code, {
      method: 'POST', headers: { Authorization: `MediaBrowser Client="JellyTV Lab", Device="Local validation", DeviceId="jellytv-local-validation", Version="0.1.0", Token="${credentials.limited.accessToken}"` }
    });
    assert.ok(authorized.ok, 'Native Quick Connect authorization');
    await expect(page.getByText('My Media', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.jellytv-hero')).toHaveCount(mode === 'enhanced' ? 1 : 0);
    await expect(page.locator('#quickConnectAlert')).toHaveCount(0);
    const userId = await page.evaluate(() => window.ApiClient.getCurrentUserId());
    assert.equal(userId, credentials.limited.userId);
    const rejections = await page.evaluate(() => window.__authRejections);
    assert.deepEqual(exceptions, []);
    assert.deepEqual(rejections, []);
    report.runs.push({ mode, invalidLoginRejected: true, errorVisible: true, quickConnect: true, correctLimitedUser: true, errors, exceptions, rejections });
    await writeFile('docs/validation/authentication.json', JSON.stringify({ ...report, status: 'RUNNING' }, null, 2) + '\n');
    await context.close();
  }
  const baseline = report.runs[0].errors.map(error => JSON.stringify(error));
  for (const run of report.runs.slice(1)) {
    const remaining = [...baseline];
    for (const error of run.errors) {
      const index = remaining.indexOf(JSON.stringify(error));
      assert.ok(index >= 0, 'Unexpected authentication diagnostic outside native baseline');
      remaining.splice(index, 1);
    }
    const nativeRejections = report.runs[0].rejections.map(rejection => JSON.stringify(rejection));
    for (const rejection of run.rejections) {
      const index = nativeRejections.indexOf(JSON.stringify(rejection));
      assert.ok(index >= 0, 'Unexpected authentication rejection outside native baseline');
      nativeRejections.splice(index, 1);
    }
    const nativeExceptions = report.runs[0].exceptions.map(exception => JSON.stringify(exception));
    for (const exception of run.exceptions) {
      const index = nativeExceptions.indexOf(JSON.stringify(exception));
      assert.ok(index >= 0, 'Unexpected authentication exception outside native baseline');
      nativeExceptions.splice(index, 1);
    }
  }
  report.status = 'PASS';
  await writeFile('docs/validation/authentication.json', JSON.stringify(report, null, 2) + '\n');
  console.log('PASS: invalid login and Quick Connect, baseline/Core/Enhanced');
} finally { await browser.close(); }
