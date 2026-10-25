import { readFile } from 'node:fs/promises';
import { test, expect, credentials, api, goto, home, detail, screenshot, noOverflow } from './helpers.mjs';

const fixtures = JSON.parse(await readFile('.lab/extended-fixtures.local.json', 'utf8'));
if (fixtures.serverId !== credentials.serverId) throw new Error('Extended fixtures belong to another server');

test('collection details and empty search retain usable navigation', async ({ page }, testInfo) => {
  await goto(page, '/details?id=' + fixtures.collection);
  await expect(page.getByText(fixtures.collectionName, { exact: true })).toBeVisible();
  const card = page.locator(`.card[data-id="${fixtures.movie}"]:visible`);
  await expect(card).toBeVisible();
  await expect(page.locator(`.card[data-id="${credentials.items['Movie:Aster Vale']}"]:visible`)).toBeVisible();
  await screenshot(page, testInfo, 'collection');
  await (testInfo.project.metadata.tv ? card : card.locator('.cardText a')).click();
  await expect(page).toHaveURL(new RegExp(fixtures.movie));
  await expect(page.getByRole('heading', { name: 'Two Frequencies', exact: true })).toBeVisible();
  await expect(page.locator('#itemDetailPage:visible .btnPlay:visible')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await goto(page, '/search');
  await page.locator('#searchTextInput').fill('jellytv-no-such-title-7941');
  await expect(page.getByText('Sorry! No results found for "jellytv-no-such-title-7941"', { exact: true })).toBeVisible();
  await screenshot(page, testInfo, 'empty-search');
  await page.locator('#searchTextInput').fill('Two Frequencies');
  const result = testInfo.project.metadata.tv
    ? page.locator(`.card[data-id="${fixtures.movie}"]:visible`).first()
    : page.locator(`a[href*="id=${fixtures.movie}"]:visible`).first();
  await expect(result).toBeVisible();
});

test('native player switches real audio tracks, adjusts volume and seeks', async ({ page }, testInfo) => {
  const path = `/UserItems/${fixtures.movie}/UserData?userId=${credentials.limited.userId}`;
  const original = (await api(`/Items/${fixtures.movie}?userId=${credentials.limited.userId}`)).UserData;
  const restore = Object.fromEntries(['PlaybackPositionTicks', 'PlayCount', 'Played', 'LastPlayedDate'].map(key => [key, original[key]]));
  try {
    await api(path, { method: 'POST', body: { PlaybackPositionTicks: 0, Played: false } });
    await detail(page, fixtures.movie);
    await page.locator('#itemDetailPage:visible .btnPlay:visible').click();
    const video = page.locator('video');
    await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThan(0.2);
    await page.mouse.move(100, 100);
    await page.locator('.btnAudio:visible').click();
    const spanish = page.getByRole('button', { name: 'High tone - Spanish - AAC - Mono', exact: true });
    await expect(spanish).toBeVisible();
    await screenshot(page, testInfo, 'audio-tracks');
    const audioRequest = page.waitForRequest(request => {
      const url = new URL(request.url());
      return [...url.searchParams].some(([key, value]) => key.toLowerCase() === 'audiostreamindex' && value === '2');
    });
    await spanish.click();
    await audioRequest;
    await expect(spanish).not.toBeVisible();
    await expect.poll(() => video.evaluate(node => node.readyState)).toBeGreaterThanOrEqual(2);
    const switchedAt = await video.evaluate(node => node.currentTime);
    await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThan(switchedAt + 0.2);
    await page.mouse.move(130, 100);
    await page.keyboard.press('k');
    await expect.poll(() => video.evaluate(node => node.paused)).toBe(true);
    const volume = page.locator('.osdVolumeSlider:visible');
    // The narrow native OSD exposes mute; its volume slider appears in landscape.
    if (testInfo.project.use.hasTouch) await page.setViewportSize({ width: 844, height: 390 });
    await page.mouse.move(150, 100);
    const volumeBox = await volume.boundingBox();
    await volume.click({ position: { x: volumeBox.width * 0.35, y: volumeBox.height / 2 } });
    // Jellyfin maps the slider to a perceptual (nonlinear) audio gain.
    await expect.poll(() => video.evaluate(node => node.volume)).toBeGreaterThan(0.01);
    await expect.poll(() => video.evaluate(node => node.volume)).toBeLessThan(0.2);
    await page.locator('.buttonMute:visible').click();
    await expect.poll(() => video.evaluate(node => node.muted || node.volume === 0)).toBe(true);
    await page.locator('.buttonMute:visible').click();
    await expect.poll(() => video.evaluate(node => node.muted || node.volume === 0)).toBe(false);
    const seek = page.locator('.osdPositionSlider:visible');
    const box = await seek.boundingBox();
    await seek.click({ position: { x: box.width * 0.5, y: box.height / 2 } });
    await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThan(35);
    expect(await video.evaluate(node => node.error?.code ?? null)).toBeNull();
    await screenshot(page, testInfo, 'player-controls');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('#itemDetailPage:visible .btnPlay:visible')).toBeVisible();
  } finally {
    if (page.url().includes('#/video')) {
      await page.mouse.move(100, 100);
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await expect(page.locator('#itemDetailPage:visible .btnPlay:visible')).toBeVisible();
    }
    await api(path, { method: 'POST', body: restore });
  }
});

test('touch swipe, missing artwork and mobile landscape remain usable', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch || testInfo.project.metadata.browser !== 'chrome', 'Real Chromium touch injection requires a touch project');
  await home(page, testInfo);
  const hero = page.locator('.jellytv-hero');
  const title = hero.locator('.jellytv-hero__title');
  const initial = await title.textContent();
  const rect = await hero.boundingBox();
  const y = rect.y + 75;
  const start = rect.x + rect.width * 0.8;
  const end = rect.x + rect.width * 0.2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start, y }] });
  for (let step = 1; step <= 8; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start + (end - start) * step / 8, y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(title).not.toHaveText(initial);
  await hero.getByRole('button', { name: /Title \d+: Without Artwork/ }).tap();
  await expect(title).toHaveText('Without Artwork');
  await expect(hero.locator('.jellytv-hero__logo')).toBeHidden();
  await expect(hero.locator('[data-focus-key="play"]')).toBeVisible();
  await screenshot(page, testInfo, 'missing-artwork');
  await page.setViewportSize({ width: 844, height: 390 });
  await noOverflow(page);
  await hero.locator('[data-focus-key="info"]').tap();
  await expect(page.locator('#itemDetailPage:visible .btnPlay:visible')).toBeVisible();
  await screenshot(page, testInfo, 'mobile-landscape');
  await cdp.detach();
});
