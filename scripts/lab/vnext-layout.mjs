import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium, firefox, webkit } from '@playwright/test';
import { separated } from './artwork-geometry.mjs';
import { isolateCore } from './core-context.mjs';

const lab = '.lab/vnext-10.10.6';
const credentials = JSON.parse(await readFile(`${lab}/credentials.local.json`));
const fixtures = JSON.parse(await readFile(`${lab}/evidence/vnext-fixtures.local.json`));
assert.equal(credentials.baseURL, 'http://127.0.0.1:18997');
const info = await fetch(`${credentials.baseURL}/System/Info/Public`).then(r => r.json());
assert.equal(info.Id, credentials.serverId);
assert.equal(info.Version, '10.10.6');
const engine = process.argv.find(arg => arg.startsWith('--engine='))?.split('=')[1] || 'chrome';
const variants = {
  chrome: () => chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }),
  edge: () => chromium.launch({ channel: 'msedge' }), chromium: () => chromium.launch(),
  firefox: () => firefox.launch(), webkit: () => webkit.launch()
};
assert.ok(variants[engine]);
const compat = process.argv.includes('--compat');
const matrix = process.argv.includes('--matrix');
const sizes = matrix ? [
  ['desktop', 1920, 1080], ['desktop', 2560, 1440], ['desktop', 3440, 1440], ['desktop', 3840, 2160],
  ['mobile', 768, 1024], ['mobile', 1024, 768], ['mobile', 320, 740], ['mobile', 360, 800],
  ['mobile', 390, 844], ['mobile', 430, 932], ['mobile', 844, 390], ['tv', 1920, 1080], ['tv', 3840, 2160]
] : [['desktop', 1920, 1080], ['mobile', 390, 844], ['tv', 1920, 1080]];
const css = await readFile('dist/jellytv-core.css', 'utf8');
const cssSha256 = createHash('sha256').update(css).digest('hex');
const patch = JSON.parse(await readFile('web-compat/scroll-options-10.10.6.json'));
const bundle = await readFile(`${lab}/server/jellyfin/jellyfin-web/${patch.file}`, 'utf8');
const bundleHash = createHash('sha256').update(bundle).digest('hex');
assert.ok([patch.originalSha256, patch.patchedSha256].includes(bundleHash));
const patched = bundle.replace(patch.before, patch.after);
assert.equal(createHash('sha256').update(patched).digest('hex'), patch.patchedSha256);
const output = `docs/validation/vnext/layout-${engine}${matrix ? '-matrix' : ''}${compat ? '-compat' : ''}`;
await mkdir(output, { recursive: true });
const report = { date: new Date().toISOString(), serverVersion: info.Version, engine, cssSha256,
  upstreamBundle: compat ? patch.patchedSha256 : bundleHash, compat, results: [], status: 'RUNNING' };
const browser = await variants[engine]();
report.browserVersion = browser.version();
try {
  for (const [layout, width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: layout === 'mobile',
      storageState: `${lab}/auth/comparison-1920.local.json` });
    await context.addInitScript(value => localStorage.setItem('layout', value), layout);
    await isolateCore(context, credentials.baseURL, `${lab}/server/jellyfin/jellyfin-web`);
    await context.route('**/Branding/Css*', route => route.fulfill({ contentType: 'text/css', body: css }));
    await context.route('**/Branding/Configuration*', route => route.fulfill({ json: { CustomCss: css, LoginDisclaimer: '', SplashscreenEnabled: false } }));
    if (compat) await context.route('**/main.jellyfin.bundle.js*', route => route.fulfill({ contentType: 'text/javascript', body: patched }));
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    let errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [key, fixture] of Object.entries(fixtures.fixtures)) {
      errors = [];
      await page.goto(`${credentials.baseURL}/web/#/details?id=${fixture.id}&serverId=${info.Id}`);
      await page.locator('#itemDetailPage:not(.hide) .nameContainer').filter({ hasText: fixture.name }).waitFor();
      await page.waitForFunction(() => document.querySelectorAll('#itemDetailPage:not(.hide)').length === 1);
      await page.waitForTimeout(1000);
      const geometry = await page.evaluate(() => {
        const box = selector => {
          const node = document.querySelector(selector.replace('#itemDetailPage ', '#itemDetailPage:not(.hide) '));
          if (!node) return null;
          const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right,
            position: style.position, display: style.display, visibility: style.visibility,
            objectFit: style.objectFit, backgroundSize: style.backgroundSize };
        };
        return { layout: document.documentElement.className, pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
          scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
          poster: box('#itemDetailPage .detailImageContainer .card'),
          scalable: box('#itemDetailPage .detailImageContainer .cardScalable'),
          portrait: !!document.querySelector('#itemDetailPage:not(.hide) .detailImageContainer .portraitCard'),
          square: !!document.querySelector('#itemDetailPage:not(.hide) .detailImageContainer .squareCard'),
          title: box('#itemDetailPage .nameContainer'), logo: box('#itemDetailPage .detailLogo'),
          buttons: box('#itemDetailPage .mainDetailButtons'), play: box('#itemDetailPage .btnPlay'),
          tracks: box('#itemDetailPage .trackSelections') };
      });
      const checks = [];
      const check = (name, passed) => checks.push({ name, passed: Boolean(passed) });
      check('page has no unintended horizontal overflow', !geometry.pageOverflow);
      check('title remains visible with positive readable dimensions', geometry.title?.width > 0 && geometry.title?.height > 0 && geometry.title.x >= -1 && geometry.title.right <= width + 1);
      check('primary actions stay in the document flow', geometry.buttons?.y >= 0 && geometry.buttons.right <= width + 1);
      const poster = geometry.poster;
      if (poster?.width > 0) {
        check('poster remains bounded instead of becoming viewport artwork', poster.width <= 320 && poster.width <= width * 0.45 && poster.position !== 'absolute');
        check('poster stays inside the viewport', poster.x >= -1 && poster.right <= width + 1 && poster.y >= 0);
        if (geometry.portrait && geometry.scalable?.width) check('portrait keeps native 2:3 ratio', Math.abs(geometry.scalable.height / geometry.scalable.width - 1.5) < 0.04);
        if (geometry.square && geometry.scalable?.width) check('music cover keeps native square ratio', Math.abs(geometry.scalable.height / geometry.scalable.width - 1) < 0.04);
      }
      if (geometry.logo?.width > 0 && geometry.logo.height > 0) check('logo is contained and bounded', geometry.logo.backgroundSize === 'contain' && geometry.logo.width <= 640 && geometry.logo.height <= 180);
      check('title artwork never overlaps the poster', separated(geometry.logo, geometry.poster));
      check('title artwork never overlaps the textual title', separated(geometry.logo, geometry.title));
      check('title artwork never overlaps primary actions', separated(geometry.logo, geometry.buttons));
      check('no unhandled browser errors', errors.length === 0);
      const name = `${layout}-${width}x${height}-${key}`;
      await page.screenshot({ path: `${output}/${name}.png` });
      report.results.push({ name, fixture: key, type: fixture.type, viewport: { width, height }, geometry, checks, errors: [...errors] });
      console.log(`${checks.every(c => c.passed) ? 'PASS' : 'FAIL'} ${name}: ${checks.filter(c => !c.passed).map(c => c.name).join('; ')}`);
    }
    await context.close();
  }
  report.status = report.results.every(r => r.checks.every(c => c.passed)) ? 'PASS' : 'FAIL';
  if (report.status !== 'PASS') process.exitCode = 1;
} catch (error) {
  report.status = 'ERROR'; report.failure = error.message; process.exitCode = 1;
  console.error(error.message);
} finally {
  await browser.close();
  await writeFile(output + '.json', JSON.stringify(report, null, 2) + '\n');
}

