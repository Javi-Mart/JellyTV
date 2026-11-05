import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// A disposable 10.10.6 server with the native Trickplay task completed and a
// playable synthetic movie. Use the same item and media source for all variants.
const [credentialsFile, storageState, fixturesFile, baseline, evidence] = process.argv.slice(2);
const lab = JSON.parse(await readFile(credentialsFile, 'utf8'));
const base = new URL(lab.baseURL);
assert.equal(base.hostname, '127.0.0.1');
assert.equal(base.protocol, 'http:');
assert.equal(base.origin, lab.baseURL);
const request = async (path, authorized = false) => {
  const response = await fetch(new URL(path, base), {
    redirect: 'error',
    headers: authorized ? { 'X-Emby-Token': lab.admin.accessToken } : {}
  });
  assert.ok(response.ok, `Lab response: ${response.status}`);
  return response.json();
};
const server = await request('/System/Info/Public');
assert.equal(server.Id, lab.serverId);
assert.equal(server.Version, '10.10.6');
const { fixtures } = JSON.parse(await readFile(fixturesFile, 'utf8'));
const id = fixtures.G.id;
const item = await request(`/Items/${id}?userId=${lab.admin.userId}`, true);
assert.ok(Object.values(item.Trickplay || {}).some(source => Object.keys(source).length), 'Generate real native tiles before running');
const patch = JSON.parse(await readFile(new URL('../../web-compat/scroll-options-10.10.6.json', import.meta.url), 'utf8'));
const hash = source => createHash('sha256').update(source).digest('hex');
if (evidence) await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });

async function exercise(label, dir, enhanced, {
  entry = 'detail', fallback = false, absent = false, tileError = false, mobile = null, transcode = false
} = {}) {
  const context = await browser.newContext({
    storageState, serviceWorkers: 'block',
    viewport: mobile || { width: 1366, height: 768 },
    hasTouch: Boolean(mobile), isMobile: Boolean(mobile)
  });
  try {
    const css = dir ? await readFile(`${dir}/jellytv-core.css`, 'utf8') : '';
    const script = enhanced ? await readFile(`${dir}/jellytv-enhanced.js`, 'utf8') : '';
    const stylesheet = enhanced ? await readFile(`${dir}/jellytv-enhanced.css`, 'utf8') : '';
    await context.route('**/Branding/Css*', route => route.fulfill({ contentType: 'text/css', body: css }));
    await context.route('**/Branding/Configuration*', route => route.fulfill({ json: { CustomCss: css } }));
    await context.route('**/web/config.json*', async route => {
      const json = await route.fetch().then(response => response.json());
      if (!enhanced) json.plugins = json.plugins.filter(name => name !== 'JellyTVEnhanced');
      await route.fulfill({ json });
    });
    await context.route('**/jellytv/jellytv-enhanced.js*', route => route.fulfill({ contentType: 'text/javascript', body: script }));
    await context.route('**/jellytv/jellytv-enhanced.css*', route => route.fulfill({ contentType: 'text/css', body: stylesheet }));
    await context.route(`**/${patch.file}*`, async route => {
      const original = await route.fetch().then(response => response.text());
      const body = hash(original) === patch.patchedSha256 ? original : original.replace(patch.before, patch.after);
      assert.equal(hash(body), patch.patchedSha256);
      await route.fulfill({ contentType: 'text/javascript', body });
    });
    // Keep the account's playback history intact across browser variants.
    await context.route(/\/Sessions\/Playing(?:\/[^?]+)?(?:\?|$)/i, route => route.fulfill({ status: 204 }));
    if (fallback) {
      await context.route(new RegExp(`/Items/${id}(?:\\?|$)`, 'i'), async route => {
        const response = await route.fetch();
        const json = await response.json();
        delete json.Trickplay;
        await route.fulfill({ response, json });
      });
    }
    const tile = new RegExp(`/Videos/${id}/Trickplay/\\d+/\\d+\\.jpg`, 'i');
    if (tileError) await context.route(tile, route => route.fulfill({ status: 404 }));
    if (transcode) await context.route(`**/Items/${id}/PlaybackInfo*`, route => {
      const data = route.request().postDataJSON();
      return route.continue({ postData: JSON.stringify({ ...data, EnableDirectPlay: false, EnableDirectStream: false }) });
    });
    const page = await context.newPage();
    const statuses = [];
    const errors = [];
    let hls = false;
    page.on('response', response => {
      if (tile.test(response.url())) statuses.push(response.status());
      if (response.ok() && /\/Videos\/[^/]+\/.*\.m3u8(?:\?|$)/i.test(response.url())) hls = true;
    });
    page.on('pageerror', error => errors.push(error.name));
    if (entry === 'detail') {
      await page.goto(new URL(`/web/#/details?id=${id}&serverId=${server.Id}`, base).href);
      await page.locator('#itemDetailPage:visible .btnPlay').first().click();
    } else {
      await page.goto(new URL('/web/#/home.html', base).href);
      const surface = page.locator(`.jellytv-${entry}`);
      await surface.getByRole('button', { name: item.Name }).click();
      await expect(surface).toHaveAttribute('data-item-id', id);
      await surface.locator('[data-focus-key="play"]').click();
    }
    const video = page.locator('video:visible').last();
    await expect.poll(() => video.evaluate(node => node.readyState)).toBeGreaterThan(1);
    if (transcode) assert.equal(hls, true, 'A real native transcode playlist must be served');
    await video.evaluate(node => node.pause());
    const pausedTime = await video.evaluate(node => node.currentTime);
    const timeline = page.locator('#videoOsdPage:visible .osdPositionSlider');
    const bubble = page.locator('#videoOsdPage:visible .sliderBubble:visible');
    const thumb = bubble.locator('.chapterThumbWrapper');
    const hover = async fraction => {
      await page.mouse.move(10, 20);
      const { x, y, width, height } = await timeline.boundingBox();
      await page.mouse.move(x + width * fraction, y + height / 2);
      await expect(bubble).toBeVisible();
    };
    const inspect = () => thumb.evaluate(node => {
      const style = getComputedStyle(node);
      const bounds = node.getBoundingClientRect();
      const viewport = window.visualViewport;
      const visible = document.elementsFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
        .some(element => element === node || node.contains(element));
      return {
        image: style.backgroundImage.startsWith('url('), position: style.backgroundPosition,
        ratio: bounds.width / bounds.height, visible, x: bounds.x, right: bounds.right, width: viewport.width,
        inViewport: bounds.x >= -1 && bounds.y >= -1 && bounds.right <= viewport.width + 1 && bounds.bottom <= viewport.height + 1
      };
    });
    const capture = name => evidence && page.screenshot({ path: `${evidence}/${label}-${name}.png` });
    await hover(0.3);
    if (fallback || absent) {
      await expect(bubble.locator('.sliderBubbleText')).toHaveText(/\d+:\d{2}/);
      await expect(thumb).toHaveCount(0);
      assert.deepEqual(statuses, []);
      await capture('time-only');
    } else {
      await expect(thumb).toBeVisible();
      await expect(bubble.locator('h2.chapterThumbText')).toHaveText(/\d+:\d{2}/);
      await expect.poll(() => statuses.includes(tileError ? 404 : 200)).toBe(true);
      const first = await inspect();
      await capture(tileError ? 'tile-error' : 'rendered');
      assert.ok(first.image && first.visible && first.inViewport && first.ratio > 1, JSON.stringify(first));
      await hover(0.57);
      await expect.poll(async () => (await inspect()).position).not.toBe(first.position);
      for (const fraction of [0.003, 0.997]) {
        await hover(fraction);
        await expect.poll(async () => (await inspect()).inViewport).toBe(true);
      }
    }
    assert.equal(await video.evaluate(node => node.currentTime), pausedTime, 'Preview must not seek');
    await page.mouse.move(10, 20);
    await expect(bubble).toHaveCount(0);
    if (mobile) {
      const { x, y, width, height } = await timeline.boundingBox();
      await page.touchscreen.tap(x + width * 0.24, y + height / 2);
      await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThan(100);
    }
    if (!mobile && entry === 'detail' && enhanced && !fallback && !tileError && !transcode && baseline === '-') {
      const osd = page.locator('#videoOsdPage:visible');
      await osd.locator('.btnFullscreen').click();
      await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
      await hover(0.35);
      await expect(thumb).toBeVisible();
      assert.ok((await inspect()).inViewport);
      await capture('fullscreen');
      await page.evaluate(() => document.exitFullscreen());
      await page.mouse.move(10, 20);
      const playPause = osd.locator('.btnPause:visible').first();
      await playPause.click();
      await expect.poll(() => video.evaluate(node => node.paused)).toBe(false);
      await playPause.click();
      await expect.poll(() => video.evaluate(node => node.paused)).toBe(true);
      await timeline.click({ position: { x: Math.round((await timeline.boundingBox()).width * 0.24), y: 2 } });
      await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThan(100);
      const volume = osd.locator('.osdVolumeSlider');
      const volumeBefore = await video.evaluate(node => node.volume);
      await volume.click({ position: { x: Math.round((await volume.boundingBox()).width * 0.38), y: 2 } });
      await expect.poll(() => video.evaluate(node => node.volume)).not.toBe(volumeBefore);
      const audible = () => video.evaluate(node => !node.muted && node.volume > 0);
      const mute = osd.locator('.buttonMute');
      await mute.click();
      await expect.poll(audible).toBe(false);
      await mute.click();
      await expect.poll(audible).toBe(true);
      await playPause.click();
      await page.mouse.move(350, 220);
      await expect(osd.locator('.videoOsdBottom')).toHaveClass(/videoOsdBottom-hidden|\bhide\b/, { timeout: 10000 });
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${label}`);
  } finally {
    await context.close();
  }
}

try {
  if (baseline && baseline !== '-') {
    await exercise('stock', null, false);
    await exercise('core-dev3', baseline, false);
    await exercise('enhanced-dev3', baseline, true);
    await exercise('hero-dev3', baseline, true, { entry: 'hero', absent: true });
    await exercise('carousel-dev3', baseline, true, { entry: 'carousel', absent: true });
  } else {
    await exercise('enhanced-dev4', 'dist', true);
    await exercise('hero-dev4', 'dist', true, { entry: 'hero' });
    await exercise('carousel-dev4', 'dist', true, { entry: 'carousel' });
    await exercise('fallback-dev4', 'dist', true, { fallback: true });
    await exercise('tile-error-dev4', 'dist', true, { tileError: true });
    for (const [width, height] of [[320, 740], [360, 800], [390, 844], [430, 932], [844, 390]]) {
      await exercise(`mobile-${width}x${height}-dev4`, 'dist', true, { mobile: { width, height } });
    }
    if (process.env.JELLYTV_TEST_TRANSCODE) await exercise('transcode-dev4', 'dist', true, { transcode: true, entry: 'hero' });
  }
} finally {
  await browser.close();
}
