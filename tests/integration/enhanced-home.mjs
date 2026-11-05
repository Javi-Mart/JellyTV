import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';

// Use a disposable Jellyfin with Enhanced already registered and test accounts.
const lab = JSON.parse(await readFile(process.argv[2], 'utf8'));
const base = new URL(lab.baseURL);
assert.equal(base.hostname, '127.0.0.1');
assert.equal(base.protocol, 'http:');
assert.equal(base.origin, lab.baseURL);
const info = await fetch(new URL('/System/Info/Public', base), { redirect: 'error' }).then(response => response.json());
assert.equal(info.Id, lab.serverId);
assert.equal(info.Version, '10.10.6');
const web = new URL('/web/', base);
const asset = name => readFile(new URL(`../../dist/${name}`, import.meta.url), 'utf8');
const javascript = process.env.JELLYTV_TEST_BUNDLE ? await readFile(process.env.JELLYTV_TEST_BUNDLE, 'utf8') : await asset('jellytv-enhanced.js');
const css = await asset('jellytv-enhanced.css');
const scrollPatch = JSON.parse(await readFile(new URL('../../web-compat/scroll-options-10.10.6.json', import.meta.url), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const home = '#/home.html';
const hero = '.jellytv-hero';
const carousel = '.jellytv-carousel';
const featured = request => {
  const { pathname, searchParams } = new URL(request.url());
  return pathname.endsWith('/Items') && searchParams.get('fields') === 'Overview,Genres,Taglines,PrimaryImageAspectRatio';
};
const engine = process.env.JELLYTV_BROWSER || 'chromium';
assert.ok(['chrome', 'chromium', 'webkit'].includes(engine));
const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'chrome' ? { channel: 'chrome' } : {});

async function scenario(name, test, authenticated = true) {
  if (process.env.JELLYTV_TEST_CASE && process.env.JELLYTV_TEST_CASE !== name) return;
  const context = await browser.newContext({
    serviceWorkers: 'block', viewport: { width: 1366, height: 768 },
    storageState: authenticated ? process.argv[3] : undefined
  });
  let served = 0;
  await context.route('**/jellytv/jellytv-enhanced.js*', route => {
    served++;
    return route.fulfill({ contentType: 'application/javascript', body: javascript });
  });
  await context.route('**/jellytv/jellytv-enhanced.css*', route => route.fulfill({ contentType: 'text/css', body: css }));
  // Keep the preexisting, byte-pinned ScrollOptions compatibility correction
  // in the lab when modern engines reject the native probe's null value.
  await context.route(`**/${scrollPatch.file}*`, async route => {
    const response = await route.fetch();
    const original = await response.text();
    const patched = sha256(original) === scrollPatch.patchedSha256 ? original : original.replace(scrollPatch.before, scrollPatch.after);
    assert.equal(sha256(patched), scrollPatch.patchedSha256);
    await route.fulfill({ response, body: patched });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message.replace(/\b[0-9a-f]{32,}\b/gi, '<id>')));
  try {
    await test(page);
    assert.equal(served, 1, 'Enhanced must load once per document');
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine} ${name}`);
  } catch (error) {
    const route = new URL(page.url()).hash.split('?')[0];
    console.error(`FAIL ${engine} ${name} at ${route || 'initial navigation'}`);
    if (errors.length) console.error(errors);
    throw error;
  } finally {
    await context.close();
  }
}

function countBatches(page) {
  let count = 0;
  page.on('request', request => { if (featured(request)) count++; });
  return () => count;
}

async function start(page) { await page.goto(new URL(home, web).href); }

async function mounted(page, host = '#indexPage:visible #homeTab:visible') {
  for (const surface of [hero, carousel]) {
    await expect(page.locator(surface)).toHaveCount(1);
    await expect(page.locator(`${host} > ${surface}`)).toBeVisible();
  }
}

async function unmounted(page) {
  await expect(page.locator(`${hero}, ${carousel}, .jellytv-preview`)).toHaveCount(0);
}

// An alternate Home has the same structure/IDs as the native view but no
// library data or JellyTV elements copied from the mounted view.
function addAlternates() {
  const native = document.querySelector('#homeTab > .jellytv-hero')?.parentElement || document.querySelector('#homeTab');
  const nativePage = native.closest('#indexPage');
  nativePage.dataset.homeFixture = 'native';
  for (const [index, label] of ['parked', 'replacement'].entries()) {
    const wrapper = document.createElement('div');
    wrapper.hidden = true;
    wrapper.dataset.wrapperFixture = label;
    const view = document.createElement('div');
    view.id = 'indexPage';
    view.dataset.homeFixture = label;
    const tab = document.createElement('div');
    tab.id = 'homeTab';
    tab.style.minHeight = '20rem';
    view.append(tab);
    wrapper.append(view);
    if (index === 0) nativePage.before(wrapper);
    else nativePage.after(wrapper);
  }
}

function instrument() {
  const stats = { mutations: [], sizes: [], listeners: [] };
  window.addEventListener('viewshow', event => {
    if (event.target.id === 'indexPage') window.fixtureViewDetail = event.detail;
  }, true);
  const Mutation = window.MutationObserver;
  const Resize = window.ResizeObserver;
  const isEnhanced = () => (new Error().stack || '').includes('jellytv-enhanced.js');
  window.MutationObserver = class extends Mutation {
    constructor(callback) {
      super(callback);
      if (isEnhanced()) {
        this.sample = { active: false };
        stats.mutations.push(this.sample);
      }
    }
    observe(...args) { if (this.sample) this.sample.active = true; return super.observe(...args); }
    disconnect() { if (this.sample) this.sample.active = false; return super.disconnect(); }
  };
  window.ResizeObserver = class extends Resize {
    constructor(callback) {
      super(callback);
      if (isEnhanced()) {
        this.targets = new Set();
        stats.sizes.push(this.targets);
      }
    }
    observe(node, ...args) { this.targets?.add(node); return super.observe(node, ...args); }
    unobserve(node) { this.targets?.delete(node); return super.unobserve(node); }
    disconnect() { this.targets?.clear(); return super.disconnect(); }
  };
  const listen = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (options?.signal && (this === window || this === document || this.id === 'homeTab') && isEnhanced()) {
      stats.listeners.push({ type, target: this, signal: options.signal });
    }
    return listen.call(this, type, listener, options);
  };
  window.homeLifecycleCounts = () => {
    const live = stats.listeners.filter(entry => !entry.signal.aborted);
    return {
      mutations: stats.mutations.filter(entry => entry.active).length,
      geometry: stats.sizes.filter(targets => targets.size).length,
      measured: stats.sizes.reduce((sum, targets) => sum + targets.size, 0),
      view: live.filter(entry => entry.type === 'viewshow').length,
      page: live.filter(entry => entry.type === 'pageshow').length,
      hash: live.filter(entry => entry.type === 'hashchange').length,
      preview: live.filter(entry => entry.type === 'pointerover' && entry.target.id === 'homeTab').length
    };
  };
}

async function login(page, account) {
  await page.locator('#txtManualName').fill(account.username);
  await page.locator('#txtManualPassword').fill(account.password);
  await page.locator('#btnLogin, .btnManualSignIn, button[type="submit"]').filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/#\/home/);
}

try {
  await scenario('duplicate', async page => {
    await page.addInitScript(instrument);
    const batches = countBatches(page);
    await start(page);
    await mounted(page);
    await page.evaluate(addAlternates);
    const native = '[data-home-fixture="native"] #homeTab';
    const replacement = '[data-home-fixture="replacement"] #homeTab';
    await page.evaluate(() => {
      const detail = window.fixtureViewDetail;
      document.querySelector('[data-home-fixture="native"]').dispatchEvent(new CustomEvent('viewshow', { detail, bubbles: true }));
    });
    await mounted(page, native);
    await expect(page.locator('#indexPage #homeTab')).toHaveCount(3);
    await page.evaluate(() => {
      document.querySelector('[data-home-fixture="native"]').classList.add('hide');
      document.querySelector('[data-wrapper-fixture="replacement"]').hidden = false;
    });
    await mounted(page, replacement);
    await page.evaluate(() => {
      const original = document.querySelector('[data-home-fixture="native"]');
      original.classList.remove('hide');
      original.dispatchEvent(new CustomEvent('viewshow', { detail: window.fixtureViewDetail, bubbles: true }));
    });
    await mounted(page, native);
    assert.deepEqual(await page.evaluate(() => window.homeLifecycleCounts()), {
      mutations: 1, geometry: 1, measured: 3, view: 1, page: 1, hash: 1, preview: 1
    });
    await page.evaluate(() => document.querySelector('[data-home-fixture="native"]').classList.add('hide'));
    await mounted(page, replacement);
    await page.evaluate(() => {
      const tab = document.querySelector('[data-home-fixture="replacement"] #homeTab');
      const next = tab.cloneNode(false);
      tab.replaceWith(next);
    });
    await mounted(page, replacement);
    await page.evaluate(() => document.querySelector('[data-home-fixture="replacement"] #homeTab').replaceChildren());
    await mounted(page, replacement);
    await page.evaluate(() => {
      document.querySelector('[data-wrapper-fixture="replacement"]').remove();
      document.querySelector('[data-wrapper-fixture="parked"]').remove();
      document.querySelector('[data-home-fixture="native"]').classList.remove('hide');
    });
    await mounted(page, native);
    assert.equal(batches(), 1);
    assert.equal((await page.evaluate(() => window.homeLifecycleCounts())).measured, 1);
    await page.evaluate(() => window[Symbol.for('jellytv.enhanced.instance')].destroy());
    await unmounted(page);
    assert.deepEqual(await page.evaluate(() => window.homeLifecycleCounts()), {
      mutations: 0, geometry: 0, measured: 0, view: 0, page: 0, hash: 0, preview: 0
    });
  });

  await scenario('navigation', async page => {
    await page.addInitScript(instrument);
    const batches = countBatches(page);
    await start(page);
    await mounted(page);
    const library = page.locator('#indexPage:visible #homeTab:visible a[href*="/movies"]').last();
    await expect(library).toBeVisible();
    for (let cycle = 0; cycle < 5; cycle++) {
      await library.click();
      await expect(page).toHaveURL(/#\/movies/);
      await unmounted(page);
      assert.equal((await page.evaluate(() => window.homeLifecycleCounts())).mutations, 0);
      await page.goBack();
      await expect(page, `Back from library cycle ${cycle + 1}`).toHaveURL(/#\/home/);
      await mounted(page);
    }
    const href = await library.getAttribute('href');
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.evaluate(async target => {
        const before = location.hash;
        location.hash = new URL(target, location.href).hash;
        await new Promise(resolve => requestAnimationFrame(resolve));
        location.hash = before;
      }, href);
      await expect(page, `Rapid navigation cycle ${cycle + 1}`).toHaveURL(/#\/home/);
      await mounted(page);
    }
    const action = page.locator(`${carousel} [data-focus-key="info"]`);
    const item = await action.getAttribute('aria-label');
    await action.click();
    await expect(page.locator('#itemDetailPage:visible')).toBeVisible();
    await unmounted(page);
    await page.goBack();
    await mounted(page);
    await expect(action).toBeFocused();
    assert.equal(await action.getAttribute('aria-label'), item);
    assert.equal(batches(), 1);
    assert.equal((await page.evaluate(() => window.homeLifecycleCounts())).preview, 1);
  });

  await scenario('pending-navigation', async page => {
    const batches = countBatches(page);
    const gate = Promise.withResolvers();
    await page.route('**/Items?**', async route => {
      if (featured(route.request())) await gate.promise;
      await route.continue().catch(() => {});
    });
    try {
      await start(page);
      await expect.poll(batches).toBe(1);
      await expect(page.locator('#homeTab .section0')).toBeVisible();
      await page.evaluate(addAlternates);
      await page.evaluate(() => {
        document.querySelector('[data-home-fixture="native"]').style.display = 'none';
        document.querySelector('[data-wrapper-fixture="replacement"]').hidden = false;
      });
      await unmounted(page);
      assert.equal(batches(), 1);
      gate.resolve();
      await mounted(page, '[data-home-fixture="replacement"] #homeTab');
      assert.equal(batches(), 1);
    } finally {
      gate.resolve();
    }
  });

  await scenario('pending-away', async page => {
    const batches = countBatches(page);
    const gate = Promise.withResolvers();
    await page.route('**/Items?**', async route => {
      if (featured(route.request())) await gate.promise;
      await route.continue().catch(() => {});
    });
    try {
      await start(page);
      await expect.poll(batches).toBe(1);
      const library = page.locator('#indexPage:visible #homeTab:visible a[href*="/movies"]').last();
      await library.click();
      await expect(page).toHaveURL(/#\/movies/);
      const finished = page.waitForResponse(response => featured(response.request()));
      gate.resolve();
      await finished;
      await unmounted(page);
      await page.goBack();
      await mounted(page);
      assert.equal(batches(), 1);
    } finally {
      gate.resolve();
    }
  });

  await scenario('user-change', async page => {
    const batches = countBatches(page);
    const gate = Promise.withResolvers();
    let firstRequest, oldAborted = false;
    page.on('requestfailed', request => { if (request === firstRequest) oldAborted = true; });
    await page.route('**/Items?**', async route => {
      if (featured(route.request()) && batches() === 1) {
        firstRequest = route.request();
        await gate.promise;
        await route.fulfill({ json: { Items: [{ Id: 'old', Name: 'Stale session title', Type: 'Movie' }] } }).catch(() => {});
      } else await route.continue();
    });
    try {
      await page.goto(new URL('#/login.html', web).href);
      await login(page, lab.limited);
      await expect.poll(batches).toBe(1);
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page.getByRole('link', { name: 'Sign Out', exact: true }).click();
      await expect(page.locator('#txtManualName')).toBeVisible();
      await unmounted(page);
      await login(page, lab.admin);
      await mounted(page);
      gate.resolve();
      await expect.poll(() => oldAborted).toBe(true);
      await expect(page.getByText('Stale session title', { exact: true })).toHaveCount(0);
      assert.equal(batches(), 2);
    } finally {
      gate.resolve();
    }
  }, false);
} catch (error) {
  console.error(error.message.replace(/\b[0-9a-f]{32,}\b/gi, '<id>').split('\n').slice(0, 12).join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
