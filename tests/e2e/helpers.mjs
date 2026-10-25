import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

export const credentials = JSON.parse(await readFile('.lab/credentials.local.json', 'utf8'));
export const items = credentials.items;
const browserLoginBaseline = JSON.parse(await readFile('docs/validation/upstream-browser-login.json', 'utf8'));
const audioBaseline = JSON.parse(await readFile('docs/validation/upstream-audio.json', 'utf8'));
export const test = base.extend({
  diagnostics: [async ({ page }, use, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push({ type: 'pageerror', message: error.message }));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const source = message.location().url;
      errors.push({ type: 'console', message: message.text(), source: source ? new URL(source).pathname : '', route: page.url().split('#')[1] || '' });
    });
    await page.addInitScript(() => {
      window.__jellytvRejections = [];
      window.addEventListener('unhandledrejection', event => window.__jellytvRejections.push(String(event.reason)));
    });
    await use(errors);
    await testInfo.attach('environment', { body: JSON.stringify({ browserVersion: page.context().browser()?.version(), browser: testInfo.project.metadata.browser || process.env.JELLYTV_BROWSER || 'chrome' }), contentType: 'application/json' });
    const rejections = await page.evaluate(() => window.__jellytvRejections || []).catch(() => []);
    // Reproduced 3/3 in unmodified Web 12.2 with empty CustomCss. See docs/research/LAB.md.
    // The server rejects Web's unauthenticated socket before login. Never ignore this after login.
    const browser = testInfo.project.metadata.browser || process.env.JELLYTV_BROWSER || 'chrome';
    const engineBaseline = browserLoginBaseline.records.filter(record => record.browser === browser);
    const knownMessages = new Set(engineBaseline.flatMap(record => record.errors.map(error => error.message)));
    knownMessages.add("WebSocket connection to 'ws://127.0.0.1:18996/socket' failed: Error during WebSocket handshake: Unexpected response code: 403");
    const upstream = testInfo.title === 'login accepts the real limited user'
      ? errors.filter(error => error.type === 'console' && error.route === '/login' && knownMessages.has(error.message)) : [];
    // Three clean native controls reproduce this single HLS diagnostic while starting
    // the dual-audio fixture. Match its source and item route, never arbitrary HLS errors.
    if (testInfo.title === 'native player switches real audio tracks, adjusts volume and seeks'
        && browser === 'chrome' && page.context().browser()?.version() === audioBaseline.browser) {
      const known = audioBaseline.runs.filter(run => run.disabled.core && run.disabled.enhanced && !run.exceptions.length)
        .flatMap(run => run.errors);
      const nativeAudio = errors.filter(error => error.type === 'console' && known.some(control =>
        error.message === control.message && error.source === control.source
        && error.route.split('&serverId=')[0] === control.route));
      expect(nativeAudio.length, 'No more HLS diagnostics than the verified vanilla control').toBeLessThanOrEqual(Math.max(0, ...audioBaseline.runs.map(run => run.errors.length)));
      upstream.push(...nativeAudio);
    }
    const unexpected = errors.filter(error => !upstream.includes(error));
    await testInfo.attach('browser-diagnostics', { body: JSON.stringify({ errors, upstream, unexpected, rejections }, null, 2), contentType: 'application/json' });
    expect(upstream.length, 'No more pre-login socket errors than the observed upstream baseline').toBeLessThanOrEqual(Math.max(1, ...engineBaseline.map(record => record.errors.length)));
    expect(unexpected, 'Browser console errors and uncaught exceptions caused by JellyTV or outside the verified upstream baseline').toEqual([]);
    expect(rejections, 'Unhandled promise rejections').toEqual([]);
  }, { auto: true }]
});
export { expect };

export async function api(path, { method = 'GET', body, role = 'limited' } = {}) {
  const response = await fetch(credentials.baseURL + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `MediaBrowser Client="JellyTV Lab", Device="Local validation", DeviceId="jellytv-local-validation", Version="0.1.0", Token="${credentials[role].accessToken}"` }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`${method} ${path.split('?')[0]}: ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}

export async function goto(page, route) {
  await page.goto('/web/#' + route);
  await page.locator('.loading:visible, .mdl-spinner.is-active:visible').first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
}

export async function home(page, testInfo) {
  await goto(page, '/home');
  await expect(page.getByText('My Media', { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(testInfo.project.metadata.tv ? /layout-tv/ : /layout-desktop|layout-mobile/);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim()), { message: 'Core theme must be installed through server Branding' }).not.toBe('');
}

export async function detail(page, itemId) {
  await goto(page, '/details?id=' + itemId + '&serverId=' + credentials.serverId);
  await expect(page.locator('#itemDetailPage:visible .btnPlay:visible')).toBeVisible();
}

export async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
}

export async function screenshot(page, testInfo, name) {
  await noOverflow(page);
  // Native cards render their geometry before the lazy artwork resolves.
  // Wait only for images intersecting the viewport, including clipped rails.
  await expect.poll(() => page.evaluate(() => {
    const intersectsViewport = element => {
      const rect = element.getBoundingClientRect();
      let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
      let right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
        if (/hidden|clip|scroll|auto/.test(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
        if (/hidden|clip|scroll|auto/.test(style.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
      }
      return right > left && bottom > top;
    };
    return [...document.querySelectorAll('.lazy[data-src], img[src]')].filter(element => intersectsViewport(element)
      // An empty data-src is the native no-artwork placeholder, not an image in flight.
      && (Boolean(element.getAttribute('data-src')) || (element.tagName === 'IMG' && !element.complete))).length;
  }), { message: 'Visible artwork must finish loading before its visual evidence is captured' }).toBe(0);
  const browser = testInfo.project.metadata.browser || process.env.JELLYTV_BROWSER || 'chrome';
  await page.screenshot({ path: `docs/screenshots/${testInfo.project.metadata.enhanced ? 'enhanced' : 'core'}-${browser === 'chrome' ? '' : browser + '-'}${testInfo.project.name}-${name}.png`, animations: 'disabled' });
}

export async function focusVisible(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && (parseFloat(style.outlineWidth) > 0 || style.boxShadow !== 'none' || getComputedStyle(element.closest('.card') || element).boxShadow !== 'none');
  });
}
