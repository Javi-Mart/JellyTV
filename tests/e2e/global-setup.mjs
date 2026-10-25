import { chromium, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { compatibilityEvidence } from '../../scripts/lab/compatibility-evidence.mjs';

export default async function setup() {
  const credentials = JSON.parse(await readFile('.lab/credentials.local.json', 'utf8'));
  if (credentials.baseURL !== 'http://127.0.0.1:18996') throw new Error('E2E is restricted to the isolated loopback lab');
  const info = await fetch(credentials.baseURL + '/System/Info/Public').then(response => response.json());
  if (info.Version !== '12.2.0' || info.Id !== credentials.serverId) throw new Error('Unexpected lab server identity');
  await compatibilityEvidence(credentials.baseURL);
  const branding = await fetch(credentials.baseURL + '/Branding/Configuration').then(response => response.json());
  if (branding.CustomCss !== await readFile('dist/jellytv-core.css', 'utf8')) throw new Error('Lab Branding does not match the current Core build');
  const config = await fetch(credentials.baseURL + '/web/config.json').then(response => response.json());
  const enhancedInstalled = config.plugins?.includes('JellyTVEnhanced') || false;
  if (enhancedInstalled !== (process.env.JELLYTV_ENHANCED === '1')) throw new Error('Lab Enhanced installation does not match the selected test mode');
  if (enhancedInstalled) {
    for (const asset of ['jellytv-enhanced.js', 'jellytv-enhanced.css']) {
      const installed = await fetch(credentials.baseURL + '/web/jellytv/' + asset).then(response => response.text());
      if (installed !== await readFile('dist/' + asset, 'utf8')) throw new Error(`Installed ${asset} differs from current build`);
    }
  }
  await mkdir('.lab/auth', { recursive: true });
  await mkdir('docs/screenshots', { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.JELLYTV_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    for (const role of ['admin', 'limited', 'tv']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const user = credentials[role === 'tv' ? 'limited' : role];
      await page.goto(credentials.baseURL + '/web/');
      await page.locator('#txtManualName').fill(user.username);
      await page.locator('#txtManualPassword').fill(user.password);
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await page.waitForURL('**/#/home');
      await page.getByText('My Media', { exact: true }).waitFor();
      if (role === 'limited') {
        // Configure only the disposable lab user through Jellyfin's own preferences.
        await page.goto(credentials.baseURL + '/web/#/mypreferenceshome');
        const labels = ['Continue Watching', 'My Media', 'Next Up', 'Recently Added Media'];
        await page.locator('#selectHomeSection1 option[value="resume"]').waitFor({ state: 'attached' });
        const sections = page.locator('select[id^="selectHomeSection"]');
        for (let index = 0; index < await sections.count(); index++) {
          await sections.nth(index).selectOption({ label: index < labels.length ? labels[index] : 'None' });
        }
        const saved = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/DisplayPreferences/'));
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        expect((await saved).ok(), 'Native Home preferences persisted').toBe(true);
        await page.goto(credentials.baseURL + '/web/#/home');
        await expect(page.locator('#homeTab:visible .sectionTitle').first()).toHaveText('Continue Watching');
      }
      if (role === 'tv') {
        await page.getByRole('button', { name: 'User Menu' }).click();
        await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
        await page.getByRole('link', { name: 'Display', exact: true }).click();
        await page.getByRole('combobox', { name: 'Display mode' }).click();
        await page.getByRole('option', { name: 'TV', exact: true }).click();
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect.poll(() => page.evaluate(() => localStorage.getItem('layout'))).toBe('tv');
        await page.goto(credentials.baseURL + '/web/#/home');
        await page.reload();
        await page.locator('html.layout-tv').waitFor();
      }
      await context.storageState({ path: `.lab/auth/${role}.local.json` });
      await context.close();
    }
  } finally { await browser.close(); }
}
