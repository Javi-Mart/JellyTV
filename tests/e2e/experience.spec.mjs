import AxeBuilder from '@axe-core/playwright';
import { test, expect, credentials, items, api, goto, home, detail, screenshot, noOverflow, focusVisible } from './helpers.mjs';

const movie = items['Movie:The Quiet Horizon'];
const series = items['Series:The Meridian Archive'];
const season = items['Season:Season 1'];
const episode = items['Episode:The Long Passage:S1E2'];

test.describe('Unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('login accepts the real limited user', async ({ page }, testInfo) => {
    await goto(page, '/login');
    await expect(page.locator('#txtManualName')).toBeVisible();
    await screenshot(page, testInfo, 'login');
    await page.locator('#txtManualName').fill(credentials.limited.username);
    await page.locator('#txtManualPassword').fill(credentials.limited.password);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page).toHaveURL(/#\/home/);
    await expect(page.getByText('My Media', { exact: true })).toBeVisible();
  });
});

test('home, library, search and all media detail types use real server data', async ({ page }, testInfo) => {
  await home(page, testInfo);
  await expect(page.getByText('Continue Watching', { exact: true })).toBeVisible();
  await expect(page.getByText('Next Up', { exact: true })).toBeVisible();
  await screenshot(page, testInfo, 'home');
  const library = credentials.views.find(view => view.CollectionType === 'movies');
  const libraryCard = page.locator(`#homeTab [data-id="${library.Id}"]`);
  await (testInfo.project.metadata.tv ? libraryCard : libraryCard.locator('a').first()).click();
  await expect(page).toHaveURL(/#\/movies/);
  await expect(page.locator(`.card[data-id="${movie}"]:visible`).first()).toBeVisible();
  await screenshot(page, testInfo, 'library');
  await goto(page, '/search');
  await page.locator('#searchTextInput').fill('Quiet Horizon');
  const result = testInfo.project.metadata.tv
    ? page.locator(`.card[data-id="${movie}"]:visible`).first()
    : page.locator(`a[href*="id=${movie}"]:visible`).first();
  await expect(result).toBeVisible();
  await screenshot(page, testInfo, 'search');
  if (testInfo.project.metadata.tv) await result.press('Enter');
  else await result.click();
  await expect(page.locator('#itemDetailPage:visible .btnPlay:visible')).toBeVisible();
  await screenshot(page, testInfo, 'movie');
  await detail(page, series);
  const seasonCard = testInfo.project.metadata.tv ? page.getByRole('button', { name: 'Season 1', exact: true }) : page.getByRole('link', { name: 'Season 1', exact: true });
  await expect(seasonCard).toBeVisible();
  await screenshot(page, testInfo, 'series');
  await seasonCard.click();
  await expect(page).toHaveURL(new RegExp(season));
  await expect(page.locator(`.listItem[data-id="${episode}"]`)).toBeVisible();
  await screenshot(page, testInfo, 'season');
  const episodeRow = page.locator(`.listItem[data-id="${episode}"]`);
  await (testInfo.project.metadata.tv ? episodeRow : episodeRow.getByRole('button', { name: 'Info', exact: true })).click();
  await expect(page.locator('#itemDetailPage:visible .btnPlay:visible')).toBeVisible();
  await screenshot(page, testInfo, 'episode');
  await detail(page, items['MusicAlbum:Ambient Coordinates']);
  await screenshot(page, testInfo, 'music');
});

test('user menu, display preferences, dialogs and favorites remain functional', async ({ page }, testInfo) => {
  await home(page, testInfo);
  if (testInfo.project.metadata.tv) {
    await page.locator('.headerUserButton:visible').click();
    await expect(page).toHaveURL(/#\/mypreferencesmenu/);
    await screenshot(page, testInfo, 'user-menu');
  } else {
    await page.getByRole('button', { name: 'User Menu' }).click();
    await screenshot(page, testInfo, 'user-menu');
    await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  }
  await page.getByRole('link', { name: 'Display', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Display mode' })).toBeVisible();
  await screenshot(page, testInfo, 'settings');
  if (testInfo.project.metadata.tv) {
    // Legacy TV uses a native select, whose popup is outside the page DOM.
    await page.getByRole('combobox', { name: 'Display mode' }).selectOption('tv');
    await expect(page.getByRole('combobox', { name: 'Display mode' })).toHaveValue('tv');
  } else {
    await page.getByRole('combobox', { name: 'Display mode' }).click();
    await expect(page.getByRole('option', { name: 'TV', exact: true })).toBeVisible();
    await screenshot(page, testInfo, 'dialog');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).not.toBeVisible();
  }
  await detail(page, movie);
  const before = await api(`/Items/${movie}?userId=${credentials.limited.userId}`);
  const favorite = page.locator('#itemDetailPage:visible .btnUserRating');
  await favorite.click();
  await expect.poll(async () => (await api(`/Items/${movie}?userId=${credentials.limited.userId}`)).UserData.IsFavorite).toBe(!before.UserData.IsFavorite);
  await favorite.click();
  await expect.poll(async () => (await api(`/Items/${movie}?userId=${credentials.limited.userId}`)).UserData.IsFavorite).toBe(before.UserData.IsFavorite);
  await goto(page, '/home?tab=1');
  await expect(page.locator(`[data-id="${items['Movie:Tides of Tomorrow']}"]:visible`).first()).toBeVisible();
  await screenshot(page, testInfo, 'favorites');
});

test('actual video plays, pauses, exposes subtitles, resumes and returns', async ({ page }, testInfo) => {
  await api(`/UserItems/${movie}/UserData?userId=${credentials.limited.userId}`, { method: 'POST', body: { PlaybackPositionTicks: 1800000000, PlayCount: 1, Played: false } });
  await detail(page, movie);
  await page.locator('#itemDetailPage:visible .btnPlay:visible').click();
  await expect(page).toHaveURL(/#\/video/);
  const video = page.locator('video');
  await expect.poll(() => video.evaluate(node => node.readyState)).toBeGreaterThanOrEqual(2);
  await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThan(179);
  expect(await video.evaluate(node => node.error?.code ?? null)).toBeNull();
  await page.keyboard.press('k');
  await expect.poll(() => video.evaluate(node => node.paused)).toBe(true);
  await page.mouse.move(100, 100);
  await screenshot(page, testInfo, 'player');
  await page.locator('.btnSubtitles:visible').click();
  await expect(page.getByRole('button', { name: 'English - SUBRIP - External', exact: true })).toBeVisible();
  await screenshot(page, testInfo, 'subtitles');
  await page.getByRole('button', { name: 'English - SUBRIP - External', exact: true }).click();
  await expect(page.getByRole('button', { name: 'English - SUBRIP - External', exact: true })).not.toBeVisible();
  await page.keyboard.press('k');
  await expect.poll(() => video.evaluate(node => node.paused)).toBe(false);
  await page.mouse.move(100, 100);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('#itemDetailPage:visible .btnPlay:visible')).toBeVisible();
  await noOverflow(page);
});

test('keyboard, reduced motion, touch targets and accessibility', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await home(page, testInfo);
  await page.keyboard.press('Tab');
  expect(await focusVisible(page), 'Keyboard focus has a visible outline or shadow').toBe(true);
  await screenshot(page, testInfo, 'keyboard');
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  await testInfo.attach('accessibility', { body: JSON.stringify(audit.violations, null, 2), contentType: 'application/json' });
  const critical = audit.violations.filter(violation => violation.impact === 'critical');
  expect(critical).toEqual([]);
  if (testInfo.project.metadata.enhanced) {
    await expect(page.locator('.jellytv-hero')).toBeVisible();
    await expect(page.locator('.jellytv-hero__rotation')).toBeDisabled();
    const targets = await page.locator('.jellytv-hero button:visible').evaluateAll(buttons => buttons.map(button => ({ label: button.getAttribute('aria-label'), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
    expect(targets.filter(target => target.width < 43 || target.height < 43)).toEqual([]);
  }
  if (testInfo.project.metadata.tv) {
    const hero = page.locator('.jellytv-hero');
    if (testInfo.project.metadata.enhanced) {
      await hero.locator('[data-focus-key="play"]').focus();
      await page.keyboard.press('ArrowRight');
      await expect(hero.locator('[data-focus-key="info"]')).toBeFocused();
      expect(await focusVisible(page)).toBe(true);
      await page.keyboard.press('ArrowRight');
      await expect(hero.locator('[data-focus-key="favorite"]')).toBeFocused();
      await page.keyboard.press('ArrowLeft');
      await expect(hero.locator('[data-focus-key="info"]')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#itemDetailPage:visible .btnPlay:visible')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(hero.locator('[data-focus-key="info"]')).toBeFocused();
      for (let step = 0; step < 6 && await hero.evaluate(element => element.contains(document.activeElement)); step++) {
        await page.keyboard.press('ArrowDown');
      }
      expect(await hero.evaluate(element => element.contains(document.activeElement)), 'D-pad can leave the hero for native rows').toBe(false);
      expect(await focusVisible(page)).toBe(true);
    }
    const libraries = page.locator('#homeTab .card[data-type="CollectionFolder"]');
    await libraries.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(libraries.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(libraries.first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/movies/);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/#\/home/);
    await testInfo.attach('dpad', { body: JSON.stringify({ horizontal: true, enter: true, back: true, heroEscape: testInfo.project.metadata.enhanced }), contentType: 'application/json' });
  }
});

test('enhanced carousel, favorites, info, playback and SPA cleanup', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.metadata.enhanced, 'Core intentionally has no JavaScript hero');
  await home(page, testInfo);
  const hero = page.locator('.jellytv-hero');
  await expect(hero).toHaveCount(1);
  const first = await hero.getAttribute('data-item-id');
  await hero.getByRole('button', { name: 'Next title' }).click();
  await expect(hero).not.toHaveAttribute('data-item-id', first);
  await hero.getByRole('button', { name: 'Previous title' }).click();
  await expect(hero).toHaveAttribute('data-item-id', first);
  const heart = hero.locator('.jellytv-hero__actions button[aria-pressed]');
  const original = await heart.getAttribute('aria-pressed');
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', original === 'true' ? 'false' : 'true');
  await expect.poll(async () => String((await api(`/Items/${first}?userId=${credentials.limited.userId}`)).UserData.IsFavorite)).toBe(original === 'true' ? 'false' : 'true');
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', original);
  await hero.getByRole('button', { name: 'More info', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(first));
  await expect(hero).toHaveCount(0);
  // A route change precedes the native detail view finishing its transition.
  // Exercise Back from a ready detail page, as in the other navigation flows.
  await expect(page.locator('#itemDetailPage:visible .btnPlay:visible')).toBeVisible();
  await page.goBack();
  await expect(hero).toHaveCount(1);
  await hero.locator('.jellytv-button--primary').click();
  await expect(page).toHaveURL(/#\/video/);
  await expect.poll(() => page.locator('video').evaluate(node => node.currentTime)).toBeGreaterThan(0);
  await expect(hero).toHaveCount(0);
  await page.keyboard.press('Escape');
  await home(page, testInfo);
  await expect(hero).toHaveCount(1);
});
