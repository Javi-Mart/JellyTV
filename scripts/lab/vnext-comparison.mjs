import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { isolateCore } from './core-context.mjs';

// Only disposable loopback fixtures. Themes are replaced per browser context,
// never in server Branding, and no production credentials are accepted.
const lab = '.lab/vnext-10.10.6';
const credentials = JSON.parse(await readFile(`${lab}/credentials.local.json`, 'utf8'));
assert.equal(credentials.baseURL, 'http://127.0.0.1:18997');
const base = credentials.baseURL;
const info = await fetch(`${base}/System/Info/Public`).then(r => r.json());
assert.equal(info.Version, '10.10.6');
assert.equal(info.Id, credentials.serverId);
const only = process.argv.find(arg => arg.startsWith('--mode='))?.split('=')[1];
const modes = only ? [only] : ['stock', 'elegantfin', 'current'];
assert.ok(modes.every(mode => ['stock', 'elegantfin', 'current', 'new'].includes(mode)));
const elegantPath = '.lab/research/elegantfin-vnext/ElegantFin/ElegantFin-jellyfin-theme-build-latest-minified.css';
const sources = {
  stock: '',
  elegantfin: await readFile(elegantPath, 'utf8'),
  current: await readFile('.lab/real-environment/branding-core-1.0.0.css', 'utf8'),
  new: await readFile('dist/jellytv-core.css', 'utf8')
};
const headers = { Authorization: `MediaBrowser Client="JellyTV Comparison", Device="Isolated lab", DeviceId="jellytv-comparison", Version="1.0.0", Token="${credentials.admin.accessToken}"` };
const items = await fetch(`${base}/Items?userId=${credentials.admin.userId}&recursive=true&includeItemTypes=Movie,Series,Season,Episode,MusicAlbum,MusicArtist,Audio,BoxSet&fields=Overview,Genres,MediaStreams,PrimaryImageAspectRatio`, { headers }).then(r => r.json());
const first = type => items.Items.find(item => item.Type === type);
const movie = items.Items.find(item => item.Name === 'Aster Vale');
const detail = item => `${base}/web/#/details?id=${item.Id}&serverId=${info.Id}`;
const movieView = credentials.views.find(view => view.CollectionType === 'movies');
const routes = [
  ['home', `${base}/web/#/home.html`, '#homeTab'],
  ['movie-library', `${base}/web/#/movies.html?topParentId=${movieView.Id}&collectionType=movies`, '.itemsContainer'],
  ['movie', detail(movie), '#itemDetailPage'],
  ['series', detail(first('Series')), '#itemDetailPage'],
  ['season', detail(first('Season')), '#itemDetailPage'],
  ['episode', detail(first('Episode')), '#itemDetailPage'],
  ['music-album', detail(first('MusicAlbum')), '#itemDetailPage'],
  ['search', `${base}/web/#/search.html`, '#searchPage'],
  ['favorites', `${base}/web/#/home.html?tab=1`, '#indexPage']
];
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const report = { date: new Date().toISOString(), serverVersion: info.Version, webCommit: 'c335a3024', browser: browser.version(), source: 'isolated-10.10.6-original-fixtures', enhanced: false, runs: [] };
await mkdir('docs/comparison/10.10.6', { recursive: true });
try {
  for (const mode of modes) {
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
      const css = sources[mode];
      const context = await browser.newContext({ viewport });
      await isolateCore(context, base, `${lab}/server/jellyfin/jellyfin-web`);
      if (viewport.width < 600) await context.addInitScript(() => localStorage.setItem('layout', 'mobile'));
      await context.route('**/Branding/Css*', route => route.fulfill({ contentType: 'text/css', body: css }));
      await context.route('**/Branding/Configuration*', route => route.fulfill({ json: { CustomCss: css, LoginDisclaimer: '', SplashscreenEnabled: false } }));
      const page = await context.newPage();
      let errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const output = `docs/comparison/10.10.6/${mode}/${viewport.width}`;
      await mkdir(output, { recursive: true });
      await page.goto(`${base}/web/`);
      await page.locator('#txtManualName').fill(credentials.admin.username);
      await page.locator('#txtManualPassword').fill(credentials.admin.password);
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await page.waitForURL('**/#/home.html');
      await context.storageState({ path: `${lab}/auth/comparison-${viewport.width}.local.json` });
      for (const [screen, url, selector] of routes) {
        errors = [];
        await page.goto(url);
        await page.locator(`${selector}:visible`).first().waitFor({ state: 'visible' });
        // Let Jellyfin's own route/image transitions settle before measuring.
        await page.waitForTimeout(650);
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.locator('.jellytv-hero, .jellytv-preview').count(), 0, 'Core comparison must not contain Enhanced surfaces');
        const geometry = await page.evaluate(() => {
          const bounds = element => {
            const r = element.getBoundingClientRect(); const s = getComputedStyle(element);
            return { selector: element.tagName.toLowerCase() + (element.className ? '.' + String(element.className).trim().replace(/\s+/g, '.') : ''), parent: element.parentElement?.className, x: r.x, y: r.y, width: r.width, height: r.height, position: s.position, display: s.display, maxWidth: s.maxWidth, imageType: s.backgroundImage.match(/\/Images\/([^/?"\s]+)/i)?.[1] || null };
          };
          return {
            htmlClass: document.documentElement.className,
            viewport: { width: innerWidth, height: innerHeight },
            pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
            detail: [...document.querySelectorAll('#itemDetailPage .detailImageContainer .card, #itemDetailPage .detailLogo, #itemDetailPage .itemBackdrop, #itemDetailPage .mainDetailButtons, #itemDetailPage .detailPagePrimaryContainer, #itemDetailPage .infoWrapper')].map(bounds),
            headings: [...document.querySelectorAll('.sectionTitle, h1.itemName')].filter(e => e.getBoundingClientRect().height).map(e => ({ text: e.textContent.trim(), ...bounds(e) }))
          };
        });
        const screenshot = `${output}/${screen}.png`;
        await page.screenshot({ path: screenshot });
        report.runs.push({ mode, viewport, screen, cssSha256: createHash('sha256').update(css).digest('hex'), screenshot, geometry, pageErrors: [...errors] });
        console.log(`${mode} ${viewport.width} ${screen}`);
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(`docs/comparison/10.10.6/${only || 'baseline'}.json`, JSON.stringify(report, null, 2) + '\n');
}
