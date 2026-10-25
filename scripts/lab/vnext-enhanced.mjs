import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium, firefox, webkit, expect } from '@playwright/test';

// Real native integration in the disposable lab; never accept production URLs.
const lab = '.lab/vnext-10.10.6';
const credentials = JSON.parse(await readFile(`${lab}/credentials.local.json`));
const base = credentials.baseURL;
assert.equal(base, 'http://127.0.0.1:18997');
const info = await fetch(`${base}/System/Info/Public`).then(response => response.json());
assert.equal(info.Version, '10.10.6'); assert.equal(info.Id, credentials.serverId);
const engine = process.argv.find(arg => arg.startsWith('--engine='))?.split('=')[1] || 'chrome';
const variants = {
  chrome: () => chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }),
  edge: () => chromium.launch({ channel: 'msedge' }), chromium: () => chromium.launch(),
  firefox: () => firefox.launch(), webkit: () => webkit.launch()
};
assert.ok(variants[engine]);
const css = await readFile('dist/jellytv-core.css', 'utf8');
const enhancedCss = await readFile('dist/jellytv-enhanced.css', 'utf8');
const enhancedJs = await readFile('dist/jellytv-enhanced.js', 'utf8');
const patch = JSON.parse(await readFile('web-compat/scroll-options-10.10.6.json'));
const bundle = await readFile(`${lab}/server/jellyfin/jellyfin-web/${patch.file}`, 'utf8');
const patched = bundle.replace(patch.before, patch.after);
assert.equal(createHash('sha256').update(patched).digest('hex'), patch.patchedSha256);
const manifest = JSON.parse(await readFile('dist/manifest.json'));
const output = `docs/validation/vnext/enhanced-${engine}`;
await mkdir(output, { recursive: true });
const browser = await variants[engine]();
const report = { date: new Date().toISOString(), engine, browserVersion: browser.version(), serverVersion: info.Version,
  assets: manifest.assets, upstreamBundle: patch.patchedSha256, results: [], status: 'RUNNING' };
let page, context, errors;
const open = async (layout, width, height, reducedMotion = 'no-preference') => {
  await context?.close(); errors = [];
  context = await browser.newContext({ viewport: { width, height }, hasTouch: layout === 'mobile', reducedMotion,
    storageState: `${lab}/auth/comparison-1920.local.json` });
  await context.addInitScript(value => {
    localStorage.setItem('layout', value);
    window.__testRejections = [];
    addEventListener('unhandledrejection', event => window.__testRejections.push(String(event.reason)));
  }, layout);
  await context.route('**/Branding/Css*', route => route.fulfill({ contentType: 'text/css', body: css }));
  await context.route('**/Branding/Configuration*', route => route.fulfill({ json: { CustomCss: css, LoginDisclaimer: '', SplashscreenEnabled: false } }));
  await context.route('**/main.jellyfin.bundle.js*', route => route.fulfill({ contentType: 'text/javascript', body: patched }));
  // Installer must already have registered the native plugin. Serve exactly the
  // current build while preserving that integration path and module ordering.
  await context.route('**/jellytv/jellytv-enhanced.js*', route => route.fulfill({ contentType: 'text/javascript', body: enhancedJs }));
  await context.route('**/jellytv/jellytv-enhanced.css*', route => route.fulfill({ contentType: 'text/css', body: enhancedCss }));
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/web/#/home.html`);
  await expect(page.locator('.jellytv-hero')).toHaveCount(1);
  await expect(page.locator('.jellytv-hero__title')).not.toHaveText('');
  await page.waitForTimeout(900);
};
const test = async (name, callback) => {
  const result = { name, passed: false };
  try { await callback(result); result.passed = true; }
  catch (error) { result.error = error.message.replace(/\b[\da-f]{32}\b/gi, '<local-id>'); }
  report.results.push(result);
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${name}${result.error ? ': ' + result.error : ''}`);
  await writeFile(output + '.json', JSON.stringify(report, null, 2) + '\n');
};
const screenshot = name => page.screenshot({ path: `${output}/${name}.png` });
const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
const diagnostics = async result => {
  result.errors = [...errors]; result.rejections = await page.evaluate(() => window.__testRejections);
  assert.deepEqual(result.errors, []); assert.deepEqual(result.rejections, []);
};
try {
  await open('desktop', 1920, 1080);
  await test('native 10.10 plugin mounts one contained hero', async result => {
    const hero = await page.locator('.jellytv-hero').boundingBox();
    assert.ok(hero.x > 0 && hero.width < 1920 && hero.height < 850);
    await noOverflow(); await diagnostics(result); await screenshot('home-desktop');
  });
  await test('carousel keeps primary actions stable across every slide', async result => {
    const dots = page.locator('.jellytv-hero__dot'); const positions = [];
    for (let i = 0; i < await dots.count(); i++) {
      await dots.nth(i).click(); await page.waitForTimeout(700);
      positions.push(await page.locator('.jellytv-hero__actions').boundingBox()); await noOverflow();
    }
    result.positions = positions;
    assert.ok(Math.max(...positions.map(p => p.y)) - Math.min(...positions.map(p => p.y)) <= 2, 'carousel CTA vertical position must stay fixed');
  });
  const card = page.locator('#homeTab .card[data-type="Movie"]').first();
  await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
  await test('leaving shortly before intent cancels preview and its request', async result => {
    let requests = 0;
    const listener = request => { if (/\/Users\/[^/]+\/Items\/[^/?]+/.test(new URL(request.url()).pathname)) requests++; };
    page.on('request', listener);
    try {
      await card.hover(); await page.waitForTimeout(200); await page.mouse.move(1, 1); await page.waitForTimeout(450);
      await expect(page.locator('.jellytv-preview')).toHaveCount(0);
      result.requests = requests; assert.equal(requests, 0);
    } finally { page.off('request', listener); }
  });
  await test('intentional hover opens context without shifting the row', async result => {
    const before = await card.boundingBox();
    await card.hover(); await expect(page.locator('.jellytv-preview')).toBeVisible();
    await page.waitForTimeout(250);
    const after = await card.boundingBox(), preview = await page.locator('.jellytv-preview').boundingBox();
    result.before = before; result.after = after; result.preview = preview;
    assert.ok(Math.abs(before.y - after.y) < 1 && Math.abs(before.width - after.width) < 1);
    assert.ok(preview.x >= 0 && preview.y >= 0 && preview.x + preview.width <= 1920 && preview.y + preview.height <= 1080);
    await expect(page.locator('.jellytv-preview button')).toHaveCount(3);
    await noOverflow(); await screenshot('preview-desktop');
  });
  await test('scroll dismisses the preview', async () => {
    await page.mouse.wheel(0, 160); await expect(page.locator('.jellytv-preview')).toHaveCount(0);
  });
  await test('keyboard actions and Escape restore focus without reopening', async () => {
    const origin = card.locator('a,button').first();
    await origin.focus(); await expect(page.locator('.jellytv-preview')).toBeVisible();
    await expect(origin).toHaveAttribute('aria-keyshortcuts', /Alt\+ArrowDown/);
    await page.keyboard.press('Alt+ArrowDown');
    await expect(page.locator('.jellytv-preview button').first()).toBeFocused();
    await page.keyboard.press('Escape'); await page.waitForTimeout(700);
    await expect(page.locator('.jellytv-preview')).toHaveCount(0); await expect(origin).toBeFocused();
    await expect(origin).not.toHaveAttribute('aria-describedby', /jellytv-preview-keyboard-hint/);
  });
  await test('favorites route removes enhancements; Back mounts only once', async result => {
    await page.goto(`${base}/web/#/home.html?tab=1`);
    await expect(page.locator('.jellytv-hero')).toHaveCount(0); await expect(page.locator('.jellytv-preview')).toHaveCount(0);
    await page.goBack(); await expect(page.locator('.jellytv-hero')).toHaveCount(1); await diagnostics(result);
  });
  for (const [width, height] of [[320, 740], [390, 844], [844, 390], [768, 1024]]) {
    await open('mobile', width, height);
    await test(`touch ${width}x${height} has no hover overlays or horizontal overflow`, async result => {
      await noOverflow(); const rect = await page.locator('.jellytv-hero__actions').boundingBox(); result.actions = rect;
      assert.ok(rect.x >= 0 && rect.x + rect.width <= width);
      await page.locator('#homeTab .card[data-type="Movie"] a').first().focus(); await page.waitForTimeout(800);
      await expect(page.locator('.jellytv-preview')).toHaveCount(0);
      await page.evaluate(() => scrollTo(0, 0)); await screenshot(`home-mobile-${width}`); await diagnostics(result);
    });
  }
  await open('tv', 1920, 1080);
  await test('TV retained focus shows context after a longer delay without taking focus', async result => {
    const origin = page.locator('#homeTab .card[data-type="Movie"] a').first();
    await origin.focus(); await page.waitForTimeout(350);
    await expect(page.locator('.jellytv-preview')).toHaveCount(0);
    await expect(page.locator('.jellytv-preview')).toBeVisible();
    await expect(origin).toBeFocused(); await expect(page.locator('.jellytv-preview button')).toHaveCount(0);
    await screenshot('preview-tv'); await page.keyboard.press('Escape'); await diagnostics(result);
  });
  await open('desktop', 1920, 1080, 'reduce');
  await test('reduced motion disables rotation and preview animation', async result => {
    await expect(page.locator('.jellytv-hero__rotation')).toBeDisabled();
    await page.locator('#homeTab .card[data-type="Movie"]').first().hover();
    await expect(page.locator('.jellytv-preview')).toBeVisible();
    result.animationDuration = await page.locator('.jellytv-preview').evaluate(node => getComputedStyle(node).animationDuration);
    assert.ok(result.animationDuration.split(',').every(value => parseFloat(value) <= 0.001)); await diagnostics(result);
  });
  report.status = report.results.every(result => result.passed) ? 'PASS' : 'FAIL';
  if (report.status !== 'PASS') process.exitCode = 1;
} catch (error) {
  report.status = 'ERROR'; report.failure = error.message.replace(/\b[\da-f]{32}\b/gi, '<local-id>');
  console.error(report.failure); process.exitCode = 1;
} finally {
  await context?.close(); await browser.close();
  await writeFile(output + '.json', JSON.stringify(report, null, 2) + '\n');
}
