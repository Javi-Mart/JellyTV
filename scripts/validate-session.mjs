import { compatibilityEvidence } from './lab/compatibility-evidence.mjs';
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { configureControl } from './lab/browser-control.mjs';
import { isFeaturedRequest } from './lab/featured-request.mjs';

const credentials = JSON.parse(await readFile('.lab/credentials.local.json', 'utf8'));
assert.equal(credentials.baseURL, 'http://127.0.0.1:18996');
const server = await fetch(credentials.baseURL + '/System/Info/Public').then(response => response.json());
assert.equal(server.Id, credentials.serverId);
assert.equal(server.Version, '12.2.0');
const browser = await chromium.launch({ executablePath: process.env.JELLYTV_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const report = { date: new Date().toISOString(), browser: browser.version(), server: server.Version, build: JSON.parse(await readFile('dist/manifest.json', 'utf8')), runs: [] };
const nativeLogout = JSON.parse(await readFile('docs/validation/upstream-logout.json', 'utf8'));
assert.equal(nativeLogout.server, server.Version);
assert.equal(nativeLogout.browser, browser.version());
assert.equal(nativeLogout.runs.length, 12);
for (const run of nativeLogout.runs) {
  assert.deepEqual(run.disabled, { core: true, enhanced: true });
  assert.deepEqual(run.exceptions, []);
}
report.nativeLogoutControl = { evidence: 'upstream-logout.json', date: nativeLogout.date, protocol: nativeLogout.protocol };
report.protocol = 'Nine fresh sessions in counterbalanced order. Every mode appears once in each position; logout requests settle before the next login. All diagnostics are retained and compared by stage, source, exact message and maximum per-run count.';
report.hostCompatibility = await compatibilityEvidence();

try {
  for (const mode of ['baseline', 'core', 'enhanced', 'core', 'enhanced', 'baseline', 'enhanced', 'baseline', 'core']) {
    // Never reuse shared auth fixtures: signing out revokes that server-side token.
    const context = await browser.newContext({ baseURL: credentials.baseURL, viewport: { width: 1366, height: 768 } });
    await configureControl(context, mode);
    const page = await context.newPage();
    const errors = [], exceptions = [], featuredUsers = [];
    const unauthorized = [];
    let stage = 'initial-login';
    page.on('pageerror', error => exceptions.push(error.message));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const source = message.location().url;
      errors.push({ message: message.text(), route: page.url().split('#')[1] || '', source: source ? new URL(source).pathname : '', stage });
    });
    page.on('response', response => {
      if (response.status() === 401) unauthorized.push({ path: new URL(response.url()).pathname, stage, featuredRequest: isFeaturedRequest(response.request()) });
    });
    page.on('request', request => {
      const url = new URL(request.url());
      if (isFeaturedRequest(request)) featuredUsers.push(url.searchParams.get('userId'));
    });
    await page.addInitScript(() => {
      window.__sessionRejections = [];
      addEventListener('unhandledrejection', event => window.__sessionRejections.push(String(event.reason)));
    });
    await page.goto('/web/#/login');
    async function login(role) {
      await page.locator('#txtManualName').fill(credentials[role].username);
      await page.locator('#txtManualPassword').fill(credentials[role].password);
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await expect(page).toHaveURL(/#\/home/);
      await expect(page.getByText('My Media', { exact: true })).toBeVisible();
      await expect(page.locator('.jellytv-hero')).toHaveCount(mode === 'enhanced' ? 1 : 0);
    }
    await login('limited');
    await page.waitForLoadState('networkidle');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() !== ''), mode !== 'baseline');
    await page.getByRole('button', { name: 'User Menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Dashboard', exact: true })).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    stage = 'logout';
    await page.getByRole('menuitem', { name: 'Sign Out', exact: true }).click();
    await expect(page.locator('#txtManualName')).toBeVisible();
    await expect(page.locator('.jellytv-hero')).toHaveCount(0);
    // A visible form is not the end of native logout. Observe its remaining
    // requests before the next login unmounts it, identically in all modes.
    await page.waitForLoadState('networkidle');
    if (mode === 'enhanced') {
      assert.equal(await page.evaluate(() => window[Symbol.for('jellytv.enhanced.instance')].cache), null);
    }
    stage = 'second-login';
    await login('admin');
    await page.getByRole('button', { name: 'User Menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Dashboard', exact: true })).toBeVisible();
    if (mode === 'enhanced') assert.deepEqual(featuredUsers, [credentials.limited.userId, credentials.admin.userId]);
    assert.deepEqual(exceptions, []);
    assert.deepEqual(await page.evaluate(() => window.__sessionRejections), []);
    report.runs.push({ mode, loginLimited: true, logoutCleanup: true, loginDifferentUser: true, permissionsCorrect: true, featuredRequestsUseCurrentUser: mode === 'enhanced', errors, unauthorized, exceptions, unhandledRejections: 0 });
    await context.close();
  }
  const counts = errors => errors.reduce((result, error) => {
    const signature = `${error.stage}|${error.message}|${error.source}`;
    result[signature] = (result[signature] || 0) + 1;
    return result;
  }, {});
  report.baselineMaximumCounts = {};
  // Include the separately reproduced native race under normal/slow CPU. Keep
  // exact stage, source, message and multiplicity; never ignore all 401 errors.
  for (const run of [...report.runs.filter(run => run.mode === 'baseline'), ...nativeLogout.runs]) {
    for (const [signature, count] of Object.entries(counts(run.errors))) {
      report.baselineMaximumCounts[signature] = Math.max(report.baselineMaximumCounts[signature] || 0, count);
    }
  }
  report.unexpectedSignatures = report.runs.filter(run => run.mode !== 'baseline').flatMap(run =>
    Object.entries(counts(run.errors)).filter(([signature, count]) => count > (report.baselineMaximumCounts[signature] || 0)).map(([signature, count]) => ({ mode: run.mode, signature, count })));
  await mkdir('docs/validation', { recursive: true });
  await writeFile('docs/validation/session.json', JSON.stringify({ ...report, status: report.unexpectedSignatures.length ? 'FAIL: differential console checks require investigation' : 'PASS' }, null, 2) + '\n');
  assert.deepEqual(report.unexpectedSignatures, [], 'Unexpected new console error during session switch');
  report.status = 'PASS: real fresh sessions, logout cleanup, user-scoped reload and permissions; baseline console diagnostics retained with counts';
  await writeFile('docs/validation/session.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
