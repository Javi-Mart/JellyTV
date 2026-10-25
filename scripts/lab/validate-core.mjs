import { compatibilityEvidence } from './compatibility-evidence.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Evidence uses the actual local Web client, with its saved limited-user session.
// It never replaces the DOM, changes server preferences or publishes theme files.
const credentials = JSON.parse(await readFile('.lab/credentials.local.json', 'utf8'));
assert.equal(credentials.baseURL, 'http://127.0.0.1:18996');
const executablePath = process.env.JELLYTV_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const mode = process.argv.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'all';
assert.ok(['all', 'matrix', 'zoom', 'tv', 'a11y'].includes(mode));
const output = 'docs/validation';
const screenshots = 'docs/screenshots/core-review';
await mkdir(output, { recursive: true });
await mkdir(screenshots, { recursive: true });
const result = { date: new Date().toISOString(), mode, client: 'Jellyfin Web 12.2', records: [] };
result.hostCompatibility = await compatibilityEvidence();
result.build = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const brandingResponse = await fetch(credentials.baseURL + '/Branding/Configuration');
assert.ok(brandingResponse.ok, 'Local Branding must be readable');
assert.equal(hash((await brandingResponse.json()).CustomCss), result.build.assets['jellytv-core.css'].sha256, 'Installed Core must match dist');
for (const file of ['jellytv-enhanced.js', 'jellytv-enhanced.css']) {
  const response = await fetch(credentials.baseURL + '/web/jellytv/' + file);
  assert.ok(response.ok, 'Installed Enhanced asset must be readable');
  assert.equal(hash(Buffer.from(await response.arrayBuffer())), result.build.assets[file].sha256, 'Installed Enhanced must match dist');
}

const matrix = [
  ['desktop-1080', 1920, 1080], ['desktop-1440', 2560, 1440], ['desktop-4k', 3840, 2160],
  ['laptop', 1366, 768], ['tablet-portrait', 768, 1024, true], ['tablet-landscape', 1024, 768, true],
  ['mobile-320', 320, 740, true], ['mobile-360', 360, 800, true], ['mobile-390', 390, 844, true],
  ['mobile-430', 430, 932, true], ['mobile-480', 480, 900, true],
  ['mobile-landscape', 844, 390, true], ['tv-1080', 1920, 1080], ['tv-4k', 3840, 2160],
  ['forced-colors', 1366, 768], ['forced-colors-dark', 1366, 768], ['contrast-more', 1366, 768]
];

async function capture(page, path, nativeZoom) {
  // Native cards initially paint their blurhash before assigning the real
  // background. Capture only after visible artwork has settled, without
  // forcing off-screen lazy images to load or changing the application DOM.
  await page.waitForFunction(() => [...document.querySelectorAll('.cardImageContainer[data-src], .jellytv-hero img')].every(node => {
    const box = node.getBoundingClientRect();
    if (!node.checkVisibility() || box.bottom <= 0 || box.top >= innerHeight || box.right <= 0 || box.left >= innerWidth) return true;
    return !node.hasAttribute('data-src') && (!(node instanceof HTMLImageElement) || node.complete);
  }));
  if (!nativeZoom) return page.screenshot({ path, animations: 'disabled' });
  // Playwright's normal screenshot clips to CSS pixels when persistent Chrome
  // uses native browser zoom. CDP captures the physical viewport correctly.
  const client = await page.context().newCDPSession(page);
  try {
    const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
    await writeFile(path, Buffer.from(shot.data, 'base64'));
  } finally { await client.detach(); }
}

async function geometry(page) {
  return page.evaluate(() => {
    const rect = element => {
      if (!element) return null;
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    const root = getComputedStyle(document.documentElement);
    return {
      viewport: { width: innerWidth, height: innerHeight, outerWidth, devicePixelRatio },
      documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth,
      layout: document.documentElement.className,
      rootFont: root.fontSize, targetSize: root.getPropertyValue('--target-size').trim(),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      transitionToken: root.getPropertyValue('--transition-normal').trim(),
      rotationDisabled: document.querySelector('.jellytv-hero__rotation')?.disabled,
      colors: Object.fromEntries(['background', 'surface', 'surface-elevated', 'text-primary', 'text-secondary', 'text-muted', 'focus', 'on-accent'].map(name => [name, root.getPropertyValue('--color-' + name).trim()])),
      poster: rect(document.querySelector('#itemDetailPage:not(.hide) .detailImageContainer .card')),
      title: rect(document.querySelector('#itemDetailPage:not(.hide) .itemName')),
      actions: rect(document.querySelector('#itemDetailPage:not(.hide) .mainDetailButtons')),
      heroTargets: [...document.querySelectorAll('.jellytv-hero button')].filter(node => node.checkVisibility()).map(node => ({ label: node.getAttribute('aria-label') || node.textContent, ...rect(node) }))
    };
  });
}

async function focus(page) {
  return page.evaluate(() => {
    const node = document.activeElement;
    const style = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    return { tag: node.tagName, classes: node.className, text: (node.getAttribute('aria-label') || node.textContent || '').trim().slice(0, 80),
      key: node.dataset.focusKey || null, type: node.dataset.type || null,
      outline: style.outline, outlineWidth: parseFloat(style.outlineWidth),
      outlineVisible: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
      inViewport: box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth };
  });
}

function verifyGeometry(record) {
  assert.ok(record.documentWidth <= record.viewport.width + 1, 'Document has accidental horizontal overflow');
  assert.ok(record.bodyWidth <= record.viewport.width + 1, 'Body has accidental horizontal overflow');
  for (const target of record.heroTargets) assert.ok(target.width >= 43 && target.height >= 43, `Small hero target: ${target.label}`);
  assert.ok(record.reducedMotion);
  assert.equal(record.transitionToken, '0ms');
  if (record.rotationDisabled !== undefined) assert.ok(record.rotationDisabled, 'Reduced motion disables hero rotation');
}

function paletteContrast(colors) {
  if (!Object.values(colors).every(value => /^#[\da-f]{6}$/i.test(value))) return { method: 'System palette; checked through axe and visual review' };
  const luminance = value => {
    const linear = value.slice(1).match(/../g).map(part => parseInt(part, 16) / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const checks = [];
  for (const text of ['text-primary', 'text-secondary', 'text-muted', 'focus']) for (const surface of ['background', 'surface', 'surface-elevated']) {
    const values = [luminance(colors[text]), luminance(colors[surface])].sort((a, b) => b - a);
    const ratio = (values[0] + 0.05) / (values[1] + 0.05);
    assert.ok(ratio >= (text === 'focus' ? 3 : 4.5), `Palette contrast: ${text} on ${surface}`);
    checks.push({ text, surface, ratio: Math.round(ratio * 100) / 100 });
  }
  return { method: 'WCAG relative luminance of resolved theme palette; artwork also needs visual review', checks };
}

async function audit(page) {
  const data = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return data.violations.map(item => ({ id: item.id, impact: item.impact, help: item.help,
    nodes: item.nodes.map(node => ({ target: node.target, failure: node.failureSummary })) }));
}

async function inspect(context, name, { zoom = null } = {}) {
  const page = context.pages()[0] || await context.newPage();
  const record = { name, zoom, errors: [] };
  page.on('pageerror', error => record.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') record.errors.push(message.text().replace(/([?&](?:api_key|token)=)[^&\s']+/gi, '$1[redacted]')); });
  try {
    await page.goto(credentials.baseURL + '/web/#/home');
    await page.getByText('My Media', { exact: true }).waitFor();
    await page.locator('.jellytv-hero').waitFor();
    record.home = await geometry(page);
    verifyGeometry(record.home);
    record.paletteContrast = paletteContrast(record.home.colors);
    if (zoom) assert.ok(Math.abs(record.home.viewport.devicePixelRatio - zoom) < 0.01, 'Native browser zoom was not applied');
    await page.keyboard.press('Tab');
    record.homeFocus = await focus(page);
    assert.ok(record.homeFocus.outlineVisible && record.homeFocus.inViewport, 'Home keyboard focus must remain visible');
    await capture(page, `${screenshots}/${name}-home.png`, zoom);
    if (zoom) {
      // Reach the hero CTA by keyboard to verify scrolling at native zoom, too.
      for (let count = 0; count < 20; count++) {
        if ((await focus(page)).key === 'play') break;
        await page.keyboard.press('Tab');
      }
      record.zoomHeroFocus = await focus(page);
      assert.equal(record.zoomHeroFocus.key, 'play');
      assert.ok(record.zoomHeroFocus.outlineVisible && record.zoomHeroFocus.inViewport);
      await capture(page, `${screenshots}/${name}-home-controls.png`, zoom);
    }
    record.homeAudit = await audit(page);
    await page.goto(credentials.baseURL + `/web/#/details?id=${credentials.items['Movie:The Quiet Horizon']}&serverId=${credentials.serverId}`);
    await page.locator('#itemDetailPage:visible .btnPlay').waitFor();
    record.details = await geometry(page);
    verifyGeometry(record.details);
    // This is a focus-style check, separate from the full keyboard-only TV flow.
    await page.locator('#itemDetailPage:visible .btnPlay').focus();
    record.detailsFocus = await focus(page);
    assert.ok(record.detailsFocus.outlineVisible && record.detailsFocus.inViewport, 'Detail focus must remain visible');
    await capture(page, `${screenshots}/${name}-details.png`, zoom);
    record.detailsAudit = await audit(page);
    assert.equal([...record.homeAudit, ...record.detailsAudit].filter(item => ['critical', 'serious'].includes(item.impact)).length, 0, 'Critical or serious accessibility violation');
    assert.deepEqual(record.errors, [], 'Browser errors');
    record.status = 'PASS';
  } catch (error) {
    record.status = 'FAIL'; record.failure = error.message;
    await page.screenshot({ path: `${screenshots}/${name}-failure.png`, animations: 'disabled' }).catch(() => {});
  }
  result.records.push(record);
  console.log(JSON.stringify({ name, status: record.status, failure: record.failure,
    homeAudit: record.homeAudit?.map(item => item.id), detailsAudit: record.detailsAudit?.map(item => item.id) }));
  await writeFile(`${output}/core-${mode}.json`, JSON.stringify(result, null, 2) + '\n');
}

async function tvFlow(browser, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, storageState: '.lab/auth/tv.local.json', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const record = { name: `tv-dpad-${width}`, steps: [], errors: [] };
  page.on('pageerror', error => record.errors.push(error.message));
  const step = async key => {
    if (key) await page.keyboard.press(key);
    await page.waitForTimeout(250); // Allow native focus scrolling to settle.
    const element = await focus(page);
    record.steps.push({ key: key || 'initial', route: page.url().split('#')[1]?.split('?')[0], element });
    return element;
  };
  try {
    await page.goto(credentials.baseURL + '/web/#/home');
    await page.locator('.jellytv-hero').waitFor();
    await page.locator('#homeTab .card[data-type="Movie"]').first().waitFor();
    await step();
    let current;
    for (let index = 0; index < 12; index++) {
      current = await step('ArrowDown');
      if (current.type === 'Movie') break;
    }
    assert.equal(current.type, 'Movie', 'A movie row must be reachable with D-pad');
    assert.ok(current.outlineVisible && current.inViewport, 'Movie card focus must remain visible');
    await page.screenshot({ path: `${screenshots}/tv-dpad-${width}-row.png`, animations: 'disabled' });
    await step('Enter');
    await page.locator('#itemDetailPage:visible .btnPlay').waitFor();
    current = await step();
    assert.ok(current.classes.includes('btnPlay'), 'Native details should initially focus Play');
    await page.screenshot({ path: `${screenshots}/tv-dpad-${width}-detail.png`, animations: 'disabled' });
    await step('Enter');
    await page.waitForURL(/#\/video/);
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
    record.video = await page.locator('video').evaluate(video => ({ readyState: video.readyState, error: video.error?.code || null }));
    assert.equal(record.video.error, null);
    // Upstream's first Back hides visible OSD controls; the next Back exits.
    for (let index = 0; index < 2 && page.url().includes('#/video'); index++) await step('Escape');
    await page.locator('#itemDetailPage:visible .btnPlay').waitFor();
    current = await step();
    assert.ok(current.outlineVisible && current.inViewport, 'Back from playback must restore visible focus');
    await step('Escape');
    await page.waitForURL(/#\/home/);
    current = await step();
    assert.ok(current.outlineVisible && current.inViewport, 'Back to Home must restore visible focus');
    assert.deepEqual(record.errors, []);
    record.status = 'PASS';
  } catch (error) { record.status = 'FAIL'; record.failure = error.message; }
  result.records.push(record);
  console.log(JSON.stringify({ name: record.name, status: record.status, failure: record.failure }));
  await writeFile(`${output}/core-${mode}.json`, JSON.stringify(result, null, 2) + '\n');
  await context.close();
}

if (['all', 'matrix', 'tv', 'a11y'].includes(mode)) {
  const browser = await chromium.launch({ executablePath });
  result.browser = browser.version();
  try {
    if (mode !== 'tv') for (const [name, width, height, hasTouch = false] of matrix.filter(item => mode !== 'a11y' || /forced-colors|contrast/.test(item[0]))) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch,
        storageState: `.lab/auth/${name.startsWith('tv-') ? 'tv' : 'limited'}.local.json`, reducedMotion: 'reduce',
        colorScheme: name === 'forced-colors-dark' ? 'dark' : 'light',
        forcedColors: name.startsWith('forced-colors') ? 'active' : 'none', contrast: name === 'contrast-more' ? 'more' : 'no-preference' });
      await inspect(context, name);
      await context.close();
    }
    if (['all', 'tv'].includes(mode)) for (const [width, height] of [[1920, 1080], [3840, 2160]]) await tvFlow(browser, width, height);
  } finally { await browser.close(); }
}

if (['all', 'zoom'].includes(mode)) {
  const auth = JSON.parse(await readFile('.lab/auth/limited.local.json', 'utf8'));
  for (const factor of [1, 2, 4]) {
    const profile = `.lab/core-zoom-${factor}`;
    await mkdir(profile + '/Default', { recursive: true });
    // Chromium's native HostZoomMap preference. The empty default partition is "x".
    // This changes actual browser zoom, confirmed by devicePixelRatio and innerWidth;
    // CSS zoom, pinch scaling and viewport-only emulation are not used.
    // https://github.com/chromium/chromium/blob/main/chrome/browser/ui/zoom/chrome_zoom_level_prefs.cc
    await writeFile(profile + '/Default/Preferences', JSON.stringify({ partition: { default_zoom_level: { x: Math.log(factor) / Math.log(1.2) } } }));
    const context = await chromium.launchPersistentContext(profile, { executablePath, viewport: null, args: ['--window-size=1306,1000'], reducedMotion: 'reduce' });
    try {
      result.browser = context.browser()?.version() || 'Chrome (persistent context)';
      await context.addCookies(auth.cookies);
      await context.addInitScript(origins => {
        const state = origins.find(item => item.origin === location.origin);
        if (state) for (const item of state.localStorage) localStorage.setItem(item.name, item.value);
      }, auth.origins);
      await inspect(context, `browser-zoom-${factor * 100}`, { zoom: factor });
    } finally { await context.close(); }
  }
}
result.status = result.records.every(record => record.status === 'PASS') ? 'PASS' : 'FAIL';
await writeFile(`${output}/core-${mode}.json`, JSON.stringify(result, null, 2) + '\n');
if (result.status !== 'PASS') process.exitCode = 1;
