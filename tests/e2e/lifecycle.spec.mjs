import { test, expect, credentials, home, noOverflow } from './helpers.mjs';

import { isFeaturedRequest as isFeatured } from '../../scripts/lab/featured-request.mjs';

test.beforeEach(async ({ page: _page }, testInfo) => {
  test.skip(!testInfo.project.metadata.enhanced, 'Enhanced lifecycle requires the installed module');
  if (credentials.baseURL !== 'http://127.0.0.1:18996') throw new Error('Only the isolated lab is allowed');
});

test('rotation runs only after opt-in and remains stopped after focus or reduced motion', async ({ page }, testInfo) => {
  await home(page, testInfo);
  const hero = page.locator('.jellytv-hero');
  await expect(hero).toHaveCount(1);
  await page.clock.install();
  const first = await hero.getAttribute('data-item-id');
  await hero.getByRole('button', { name: 'Start rotation', exact: true }).click();
  await page.clock.fastForward(10_100);
  await expect(hero).not.toHaveAttribute('data-item-id', first);
  await hero.locator('[data-focus-key="play"]').focus();
  const second = await hero.getAttribute('data-item-id');
  await page.clock.fastForward(30_100);
  await expect(hero).toHaveAttribute('data-item-id', second);
  await expect(hero.getByRole('button', { name: 'Start rotation', exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(hero.locator('.jellytv-hero__rotation')).toBeDisabled();
});

test('repeated SPA detail and Back restore one hero and the focused action without redundant API batches', async ({ page }, testInfo) => {
  let batches = 0;
  page.on('request', request => { if (isFeatured(request)) batches++; });
  await home(page, testInfo);
  const hero = page.locator('.jellytv-hero');
  for (let cycle = 0; cycle < 12; cycle++) {
    await expect(hero).toHaveCount(1);
    const item = await hero.getAttribute('data-item-id');
    await hero.getByRole('button', { name: 'More info', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(item));
    await expect(hero).toHaveCount(0);
    await page.goBack();
    await expect(hero).toHaveCount(1);
    await expect(hero).toHaveAttribute('data-item-id', item);
    await expect(hero.locator('[data-focus-key="info"]')).toBeFocused();
  }
  expect(batches).toBe(1);
  await noOverflow(page);
});

test('leaving Home cancels a delayed featured response without late insertion', async ({ page }, testInfo) => {
  let release;
  let requested;
  const arrived = new Promise(resolve => { requested = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/Items?**', async route => {
    if (!isFeatured(route.request())) return route.continue();
    requested();
    await gate;
    await route.continue().catch(() => {});
  });
  try {
    await home(page, testInfo);
    await arrived;
    await page.evaluate(() => { location.hash = '#/search'; });
    await expect(page.locator('#searchTextInput')).toBeVisible();
    release();
    await expect(page.locator('.jellytv-hero')).toHaveCount(0);
    await page.unroute('**/Items?**');
    await page.evaluate(() => { location.hash = '#/home'; });
    await expect(page.locator('.jellytv-hero')).toHaveCount(1);
  } finally { release(); }
});

test('a timed-out featured request offers a working retry and keeps native rows usable', async ({ page }, testInfo) => {
  let release;
  let requested;
  const arrived = new Promise(resolve => { requested = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  let delayed = false;
  await page.route('**/Items?**', async route => {
    if (!isFeatured(route.request()) || delayed) return route.continue();
    delayed = true;
    requested();
    await gate;
    await route.continue().catch(() => {});
  });
  await page.clock.install();
  try {
    await home(page, testInfo);
    await arrived;
    await page.clock.fastForward(12_100);
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
    await expect(page.getByText('Continue Watching', { exact: true })).toBeVisible();
    release();
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.locator('.jellytv-hero')).toHaveCount(1);
    await expect(page.locator('.jellytv-notice')).toHaveCount(0);
  } finally { release(); }
});

