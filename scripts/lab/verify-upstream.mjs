import { chromium, firefox, webkit } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { install } from '../install.mjs';

const credentials = JSON.parse(await readFile('.lab/credentials.local.json', 'utf8'));
if (credentials.baseURL !== 'http://127.0.0.1:18996') throw new Error('Loopback lab only');
const root = '.lab/server/jellyfin/jellyfin-web';
const browserName = process.env.JELLYTV_BROWSER || 'chrome';
const browserTypes = { chrome: chromium, chromium, edge: chromium, firefox, webkit };
if (!browserTypes[browserName]) throw new Error(`Unsupported baseline browser: ${browserName}`);
const launchOptions = browserName === 'chrome' ? { executablePath: process.env.JELLYTV_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : browserName === 'edge' ? { channel: 'msedge' } : {};
const headers = { 'Content-Type': 'application/json', Authorization: `MediaBrowser Client="JellyTV Validation", Device="Local lab", DeviceId="jellytv-validation", Version="0.1.0", Token="${credentials.admin.accessToken}"` };
const branding = await fetch(credentials.baseURL + '/Branding/Configuration', { headers }).then(response => response.json());
async function setBranding(body) {
  const response = await fetch(credentials.baseURL + '/System/Configuration/branding', { method: 'POST', headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Branding HTTP ${response.status}`);
}
const records = [];
let removed = false;
try {
  await install({ action: 'uninstall', root });
  removed = true;
  await setBranding({ ...branding, CustomCss: '' });
  const browser = await browserTypes[browserName].launch(launchOptions);
  try {
    for (let iteration = 1; iteration <= 3; iteration++) {
      const page = await browser.newPage();
      const errors = [];
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(credentials.baseURL + '/web/#/login');
      await page.locator('#txtManualName').fill(credentials.limited.username);
      await page.locator('#txtManualPassword').fill(credentials.limited.password);
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await page.waitForURL('**/#/home');
      await page.getByText('My Media', { exact: true }).waitFor();
      const clean = await page.evaluate(() => ({ theme: getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim(), enhancedScripts: [...document.scripts].filter(script => script.src.includes('/jellytv/')).length }));
      records.push({ iteration, errors, clean, loginSucceeded: true, browserVersion: browser.version() });
      await page.close();
    }
  } finally { await browser.close(); }
} finally {
  await setBranding(branding);
  if (removed) await install({ action: 'install', root, webVersion: '12.2' });
}
const evidence = { date: new Date().toISOString(), browser: browserName, serverVersion: '12.2.0', baseline: 'Original index/config and empty server CustomCss, new browser context on every login', records };
const filename = `upstream-login${browserName === 'chrome' ? '' : '-' + browserName}.json`;
await writeFile('.lab/evidence/' + filename, JSON.stringify(evidence, null, 2) + '\n');
// Redact credentials defensively before allowing baseline messages into public evidence.
let publicEvidence = JSON.stringify(evidence, null, 2);
for (const role of ['admin', 'limited']) {
  for (const secret of [credentials[role].password, credentials[role].accessToken]) {
    if (secret) publicEvidence = publicEvidence.replaceAll(secret, '[REDACTED]');
  }
}
await writeFile('docs/validation/' + filename, publicEvidence + '\n');
console.log(JSON.stringify({ path: 'docs/validation/' + filename, browser: browserName, records: records.map(record => ({ iteration: record.iteration, errorCount: record.errors.length, clean: record.clean, loginSucceeded: record.loginSucceeded, browserVersion: record.browserVersion })) }));
