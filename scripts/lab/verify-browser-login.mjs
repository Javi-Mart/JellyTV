import { firefox, webkit } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { configureControl } from './browser-control.mjs';

const credentials = JSON.parse(await readFile('.lab/credentials.local.json', 'utf8'));
if (credentials.baseURL !== 'http://127.0.0.1:18996') throw new Error('Only the isolated loopback lab is supported');
const records = [];
for (const [name, engine] of Object.entries({ firefox, webkit })) {
  const browser = await engine.launch();
  try {
    for (let iteration = 1; iteration <= 3; iteration++) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      try {
        await configureControl(context, 'baseline');
        const page = await context.newPage();
        const errors = [];
        page.on('console', message => {
          if (message.type() === 'error') errors.push({ message: message.text(), route: page.url().split('#')[1] || '' });
        });
        page.on('pageerror', error => errors.push({ type: 'pageerror', message: error.message }));
        await page.goto(credentials.baseURL + '/web/#/login');
        await page.locator('#txtManualName').fill(credentials.limited.username);
        await page.locator('#txtManualPassword').fill(credentials.limited.password);
        await page.getByRole('button', { name: 'Sign In', exact: true }).click();
        await page.getByText('My Media', { exact: true }).waitFor();
        const clean = await page.evaluate(() => ({
          theme: getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim(),
          enhancedGlobal: typeof window.JellyTVEnhanced,
          hero: document.querySelectorAll('.jellytv-hero').length
        }));
        if (clean.theme || clean.enhancedGlobal !== 'undefined' || clean.hero) throw new Error('Baseline still contains JellyTV');
        // Only pre-login socket diagnostics are safe and relevant to export.
        if (errors.some(error => error.type === 'pageerror' || error.route !== '/login' || !error.message.includes('ws://127.0.0.1:18996/socket'))) throw new Error('Unexpected baseline error; inspect the browser locally before publishing evidence');
        records.push({ browser: name, version: browser.version(), iteration, errors, clean, loginSucceeded: true });
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
await writeFile('docs/validation/upstream-browser-login.json', JSON.stringify({
  serverVersion: '12.2.0',
  baseline: 'Per-context vanilla control: original plugin list, empty JellyTV assets, empty CustomCss response; fresh context per login',
  records
}, null, 2) + '\n');
console.log(`Verified ${records.length} fresh-context logins with no JellyTV assets or CSS`);
