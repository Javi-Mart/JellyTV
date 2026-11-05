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

async function scenario(name, test, authenticated = true, documents = 1) {
  if (process.env.JELLYTV_TEST_CASE && process.env.JELLYTV_TEST_CASE !== name) return;
  const mobile = name === 'carousel-touch';
  const context = await browser.newContext({
    serviceWorkers: 'block', viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 },
    hasTouch: mobile, isMobile: mobile,
    storageState: authenticated ? process.argv[3] : undefined,
    recordVideo: name === 'motion-handoff' && process.env.JELLYTV_MOTION_VIDEO ?
      { dir: process.env.JELLYTV_MOTION_VIDEO, size: { width: 1366, height: 768 } } : undefined
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
    assert.equal(served, documents, 'Enhanced must load once per document');
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

  await scenario('cinematic-favorite', async page => {
    let attempts = 0;
    let rejected = true;
    const gate = Promise.withResolvers();
    await page.route('**/UserFavoriteItems/**', async route => {
      attempts++;
      if (rejected) {
        await gate.promise;
        await route.fulfill({ status: 403, json: {} });
      } else {
        await route.fulfill({ json: { IsFavorite: route.request().method() === 'POST' } });
      }
    });
    try {
      await start(page);
      await mounted(page);
      const heroFavorite = page.locator(`${hero} [data-focus-key="favorite"]`);
      const railFavorite = page.locator(`${carousel} [data-focus-key="favorite"]`);
      const readFill = control => control.locator('.jellytv-heart path').evaluate(path => {
        const css = getComputedStyle(path);
        return css.fill === css.color;
      });
      const initial = await heroFavorite.getAttribute('aria-pressed') === 'true';
      assert.equal(await readFill(heroFavorite), initial);
      await heroFavorite.click();
      await expect(heroFavorite).toHaveAttribute('aria-busy', 'true');
      await expect(heroFavorite).toHaveAttribute('aria-pressed', String(initial));
      assert.equal(attempts, 1);
      gate.resolve();
      await expect(page.locator(`${hero} .jellytv-hero__status`)).not.toBeEmpty();
      await expect(heroFavorite).toHaveAttribute('aria-pressed', String(initial));
      assert.equal(await readFill(heroFavorite), initial);
      rejected = false;
      for (const active of [!initial, initial]) {
        await heroFavorite.click();
        for (const control of [heroFavorite, railFavorite]) {
          await expect(control).toHaveAttribute('aria-pressed', String(active));
          await expect.poll(() => readFill(control)).toBe(active);
        }
      }
      assert.equal(attempts, 3);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await railFavorite.click();
      await expect(heroFavorite).toHaveAttribute('aria-pressed', String(!initial));
      await expect.poll(() => readFill(railFavorite)).toBe(!initial);
      assert.equal(await railFavorite.locator('.jellytv-heart').evaluate(svg => svg.getAnimations().length), 0);
      assert.equal(attempts, 4);
    } finally {
      gate.resolve();
    }
  });

  await scenario('cinematic-artwork', async page => {
    await start(page);
    await mounted(page);
    const spotlight = page.locator(hero);
    const backdrop = spotlight.locator('.jellytv-hero__backdrop.is-visible');
    await expect(backdrop).toHaveCount(1);
    const current = await spotlight.getAttribute('data-item-id');
    const source = await backdrop.getAttribute('src');
    const targets = await page.evaluate(() => {
      const spotlight = window[Symbol.for('jellytv.enhanced.instance')].hero;
      const width = Math.min(3840, Math.ceil(spotlight.root.clientWidth * Math.min(devicePixelRatio || 1, 2) / 320) * 320);
      return spotlight.items.slice(1).map((item, offset) => ({
        id: item.Id, index: offset + 1,
        src: spotlight.adapter.image(spotlight.session, item, 'Backdrop', width)
      })).filter(item => item.src);
    });
    assert.ok(targets.length >= 2, 'At least three featured entries must have backdrops in the lab');
    const [slow, broken] = targets;
    const gate = Promise.withResolvers();
    let waiting = false;
    await page.route(new URL(slow.src, web).href, async route => {
      waiting = true;
      await gate.promise;
      await route.continue().catch(() => {});
    });
    await page.route(new URL(broken.src, web).href, route => route.abort('failed'));
    const dots = spotlight.locator('.jellytv-hero__dot');
    const baseline = (await spotlight.locator('.jellytv-hero__actions').boundingBox()).y;
    try {
      await dots.nth(slow.index).click();
      await expect.poll(() => waiting).toBe(true);
      await expect(spotlight).toHaveAttribute('data-item-id', current);
      await expect(backdrop).toHaveAttribute('src', source);
      await dots.nth(broken.index).click();
      await expect(spotlight).toHaveAttribute('data-item-id', broken.id);
      await expect(backdrop).toHaveCount(0);
      await expect(spotlight).toHaveClass(/without-backdrop/);
      assert.ok(Math.abs((await spotlight.locator('.jellytv-hero__actions').boundingBox()).y - baseline) <= 2,
        'The CTA must stay anchored during artwork replacement');
      gate.resolve();
      await dots.first().click();
      await expect(spotlight).toHaveAttribute('data-item-id', current);
      await expect(backdrop).toHaveAttribute('src', source);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await dots.nth(slow.index).click();
      await expect(spotlight).toHaveAttribute('data-item-id', slow.id);
      await expect(backdrop).toHaveAttribute('src', slow.src);
      await expect(backdrop).toHaveCSS('animation-name', 'none');
    } finally {
      gate.resolve();
    }
  });

  await scenario('cinematic-detail', async page => {
    const core = await asset('jellytv-core.css');
    await page.route('**/Branding/Css*', route => route.fulfill({ contentType: 'text/css', body: core }));
    await page.route('**/Branding/Configuration*', route => route.fulfill({ json: { CustomCss: core, SplashscreenEnabled: false } }));
    await start(page);
    await mounted(page);
    await page.locator(`${hero} [data-focus-key="info"]`).click();
    const detail = page.locator('#itemDetailPage:visible');
    await expect(detail.locator('.detailPageWrapperContainer')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.backdropContainer .backdropImage.displayingBackdropImage')).toHaveCSS('mask-image', /linear-gradient/);
    await expect(detail.locator('.mainDetailButtons')).toBeVisible();
    await expect(detail.locator('.overview')).toBeVisible();
    await page.goBack();
    await mounted(page);
    await expect(page.locator(`${hero} [data-focus-key="info"]`)).toBeFocused();
  });

  await scenario('motion-handoff', async page => {
    await start(page);
    await mounted(page);
    await expect(page.locator(`${hero} .jellytv-hero__backdrop.is-visible`)).toHaveCount(1);
    const samples = await page.evaluate(async () => {
      const { hero, carousel } = window[Symbol.for('jellytv.enhanced.instance')];
      const original = hero.activeBackdrop;
      const previous = hero.index;
      const target = hero.items.findIndex((item, index) =>
        index !== previous && hero.adapter.image(hero.session, item, 'Backdrop', 1280));
      const expected = hero.items[target].Id;
      const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const sample = [];
      hero.dotButtons[target].click();
      const end = performance.now() + 3000;
      do {
        const now = await nextFrame();
        const incoming = hero.root.querySelector('.is-incoming');
        sample.push({
          now, id: hero.root.dataset.itemId, title: hero.heading.textContent,
          incoming: incoming ? Number(getComputedStyle(incoming).opacity) : 0,
          incomingGlow: incoming ? Number(getComputedStyle(hero.glow(incoming)).opacity) : 0,
          outgoing: Number(getComputedStyle(original).opacity),
          copy: Number(getComputedStyle(hero.copy).opacity),
          active: hero.root.querySelectorAll('.jellytv-hero__backdrop.is-visible').length
        });
      } while (performance.now() < end && (hero.root.dataset.itemId !== expected || hero.transition));
      carousel.root.scrollIntoView({ block: 'start' });
      const candidate = carousel.cards[1].root;
      const before = candidate.getBoundingClientRect().width;
      const y = carousel.panel.getBoundingClientRect().y;
      carousel.next.click();
      const widths = [];
      let now;
      const start = performance.now();
      do {
        now = await nextFrame();
        widths.push(candidate.getBoundingClientRect().width);
      } while (now - start < 480);
      return {
        sample, expected, name: hero.items[target].Name, before, widths,
        panelDelta: carousel.panel.getBoundingClientRect().y - y,
        activeCards: carousel.rail.querySelectorAll('.is-active').length,
        leftover: carousel.animations.filter(animation => animation.playState === 'running').length,
        ambient: getComputedStyle(hero.glow(hero.activeBackdrop)).getPropertyValue('--ambient-right')
      };
    });
    assert.ok(samples.sample.some(row => row.incoming > 0.08 && row.incoming < 0.43 && row.outgoing === 1 && row.id !== samples.expected),
      JSON.stringify(samples.sample.map(row => [row.incoming, row.outgoing, row.copy, row.active, row.id === samples.expected])));
    assert.ok(samples.sample.some(row => row.incoming > 0.57 && row.incoming < 0.95 && row.id === samples.expected && row.copy < 0.98));
    assert.ok(samples.sample.every(row => row.active === 1));
    assert.ok(samples.sample.every(row => Math.abs(row.incoming - row.incomingGlow) < 0.04));
    assert.equal(samples.sample.at(-1).title, samples.name);
    assert.ok(samples.widths.some(width => width > samples.before + 8 && width < samples.widths.at(-1) - 8));
    assert.ok(Math.abs(samples.panelDelta) < 1);
    assert.equal(samples.activeCards, 1);
    assert.equal(samples.leftover, 0);
    assert.match(samples.ambient, /rgb\(/);

    const invoked = await page.evaluate(async () => {
      const { hero } = window[Symbol.for('jellytv.enhanced.instance')];
      const previous = hero.index;
      const target = hero.items.findIndex((item, index) =>
        index !== previous && hero.adapter.image(hero.session, item, 'Backdrop', 1280));
      const actions = [];
      const details = hero.adapter.details;
      hero.adapter.details = (_, item) => actions.push(item.Id);
      const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const until = async predicate => {
        const end = performance.now() + 3000;
        while (!predicate() && performance.now() < end) await nextFrame();
      };
      try {
        hero.show(target);
        await until(() => hero.transition && hero.index === previous);
        if (!hero.transition || hero.index !== previous) throw new Error('Expected the outgoing slide to remain interactive');
        hero.info.click();
        hero.show(target);
        await until(() => hero.index === target);
        hero.info.click();
        return { actions, expected: [hero.items[previous].Id, hero.items[target].Id] };
      } finally {
        hero.adapter.details = details;
      }
    });
    assert.deepEqual(invoked.actions, invoked.expected);

    const pending = await page.evaluate(() => {
      const { hero } = window[Symbol.for('jellytv.enhanced.instance')];
      const selected = hero.index;
      const latest = (selected + 3) % hero.items.length;
      for (let offset = 1; offset <= 3; offset++) hero.show(selected + offset);
      return hero.items[latest].Id;
    });
    await expect(page.locator(hero)).toHaveAttribute('data-item-id', pending);
    await expect(page.locator(`${hero} [data-pending]`)).toHaveCount(0);
    await expect(page.locator(`${hero} .jellytv-hero__backdrop.is-incoming`)).toHaveCount(0);
  });

  await scenario('carousel-copy-handoff', async page => {
    await start(page);
    await mounted(page);
    const result = await page.evaluate(async () => {
      const { carousel } = window[Symbol.for('jellytv.enhanced.instance')];
      const target = carousel.cards[1].root;
      const title = target.querySelector('.jellytv-carousel__card-title');
      const logo = target.querySelector('.jellytv-carousel__logo');
      const stable = () => {
        const css = getComputedStyle(title);
        return [css.inlineSize, css.fontSize, Math.round(title.getBoundingClientRect().height * 64)];
      };
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const baseline = stable();
      const compact = target.getBoundingClientRect().width;
      const focus = carousel.favorite;
      focus.focus({ preventScroll: true });
      const frames = [];
      const capture = async (targetIndex, phase) => {
        carousel.select(targetIndex, { announce: true });
        const start = performance.now();
        do {
          await frame();
          const width = target.getBoundingClientRect().width;
          frames.push({
            phase, width, geometry: stable(), id: carousel.root.dataset.itemId,
            title: carousel.heading.textContent, opacity: Number(getComputedStyle(carousel.copy).opacity),
            focus: document.activeElement === focus, titleVisible: getComputedStyle(title).visibility === 'visible',
            logoVisible: getComputedStyle(logo).visibility === 'visible', resizing: Boolean(carousel.cards[1].resize),
            selected: Number(carousel.rail.querySelector('[aria-pressed="true"]').dataset.index)
          });
        } while (performance.now() - start < 550 && (carousel.pending || carousel.animations.some(animation => animation.playState === 'running')));
      };
      await capture(1, 'expansion');
      const expanded = target.getBoundingClientRect().width;
      await capture(0, 'contraction');
      const details = carousel.adapter.details;
      const actions = [];
      carousel.adapter.details = (_, item) => actions.push(item.Id);
      try {
        carousel.next.click();
        carousel.info.click();
        carousel.next.click();
        carousel.next.click();
        carousel.next.click();
        const latest = carousel.requestedIndex;
        const until = performance.now() + 2000;
        while (carousel.index !== latest && performance.now() < until) await frame();
        carousel.info.click();
      } finally {
        carousel.adapter.details = details;
      }
      return { frames, baseline, compact, expanded, actions, items: carousel.items.map(({ Id, Name }) => [Id, Name]) };
    });
    const [a, b, , d] = result.items;
    assert.ok(result.expanded > result.compact + 50);
    for (const phase of ['expansion', 'contraction']) {
      assert.ok(result.frames.some(row => row.phase === phase && row.width > result.compact + 5 && row.width < result.expanded - 5));
    }
    assert.ok(result.frames.some(row => row.phase === 'expansion' && row.id === a[0] && row.opacity > 0 && row.opacity < 0.9));
    assert.ok(result.frames.some(row => row.phase === 'expansion' && row.id === b[0] && row.opacity > 0 && row.opacity < 0.9));
    for (const row of result.frames) {
      assert.deepEqual(row.geometry, result.baseline, 'The title geometry must stay independent of animated card width');
      assert.notEqual(row.titleVisible, row.logoVisible, 'Exactly one title representation is visible');
      assert.deepEqual([row.id, row.title], result.items[row.selected]);
      assert.equal(row.focus, true);
    }
    const duringExpansion = result.frames.filter(row => row.phase === 'expansion' && row.resizing);
    assert.equal(new Set(duringExpansion.map(row => row.logoVisible)).size, 1, 'A delayed logo must wait until the width settles');
    assert.deepEqual(result.actions, [a[0], d[0]]);
    const rail = page.locator(`${carousel} .jellytv-carousel__rail`);
    await rail.locator('button[tabindex="0"]').focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(`${carousel} [data-focus-key="play"]`)).toBeFocused();
    await expect(page.locator(carousel)).toHaveAttribute('data-item-id', b[0]);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await rail.locator('button').first().focus();
    await expect(page.locator(carousel)).toHaveAttribute('data-item-id', a[0]);
    assert.equal(await page.locator(`${carousel} .jellytv-carousel__copy`).evaluate(node => node.getAnimations().length), 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await rail.locator('button').nth(1).hover();
    await expect(page.locator(carousel)).toHaveAttribute('data-item-id', b[0]);
    await page.mouse.move(1, 1);
    await expect(page.locator(carousel)).toHaveAttribute('data-item-id', b[0]);
  });

  await scenario('carousel-touch', async page => {
    await start(page);
    await mounted(page);
    const surface = page.locator(carousel);
    const cards = surface.locator('.jellytv-carousel__card');
    const second = cards.nth(1);
    await second.scrollIntoViewIfNeeded();
    const startY = await surface.evaluate(node => node.getBoundingClientRect().top);
    await second.tap();
    await expect(second).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => surface.evaluate(node => node.getBoundingClientRect().top)).toBeCloseTo(startY, 0);
    const pointer = { pointerId: 11, pointerType: 'touch', bubbles: true, clientY: 300 };
    await second.dispatchEvent('pointerdown', { ...pointer, clientX: 260 });
    await second.dispatchEvent('pointerup', { ...pointer, clientX: 150 });
    await expect(cards.nth(2)).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => window[Symbol.for('jellytv.enhanced.instance')].carousel.next.click());
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(cards.nth(3)).toHaveAttribute('aria-pressed', 'true');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.evaluate(() => window[Symbol.for('jellytv.enhanced.instance')].carousel.next.click());
    const library = page.locator('#indexPage:visible #homeTab:visible a[href*="/movies"]').last();
    await library.evaluate(node => node.click());
    await expect(page).toHaveURL(/#\/movies/);
    await unmounted(page);
    await page.goBack();
    await expect(page).toHaveURL(/#\/home/);
    try { await mounted(page); }
    catch (error) {
      const diagnostic = await page.evaluate(() => {
        const app = window[Symbol.for('jellytv.enhanced.instance')];
        return { host: Boolean(app.host), hero: app.hero?.root.isConnected, carousel: app.carousel?.root.isConnected,
          cached: app.cache?.items?.length, playing: app.playing, layout: document.documentElement.className };
      });
      throw new Error(`Landscape back: ${JSON.stringify(diagnostic)}\n${error.message}`, { cause: error });
    }
  });

  await scenario('carousel-logos-initial', async page => {
    const logoRequests = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin === base.origin && /\/Images\/Logo$/i.test(url.pathname) && url.searchParams.get('maxWidth') === '640') logoRequests.push(url.pathname);
    });
    const logoState = () => page.evaluate(() => {
      const rail = window[Symbol.for('jellytv.enhanced.instance')].carousel;
      return rail.items.map((item, index) => {
        const { logo, root } = rail.cards[index];
        const expected = rail.adapter.image(rail.session, item, 'Logo', 640);
        return { index, expected, actual: logo.getAttribute('src'), decoded: logo.naturalWidth > 0,
          visible: getComputedStyle(logo).visibility === 'visible',
          titleVisible: getComputedStyle(root.querySelector('.jellytv-carousel__card-title')).visibility === 'visible' };
      });
    });
    const checkFirstHome = async () => {
      await mounted(page);
      await expect.poll(async () => {
        const rows = await logoState();
        return rows.filter(row => row.expected && (!row.decoded || !row.visible || row.titleVisible || row.actual !== row.expected)).length;
      }).toBe(0);
      const rows = await logoState();
      assert.ok(rows.filter(row => row.index > 0 && row.expected).length >= 2, 'Include at least two compact cards with real Logo artwork');
      const active = page.locator(`${carousel} .jellytv-carousel__card[aria-pressed="true"]`);
      await expect(active).toHaveAttribute('data-index', '0');
      return rows;
    };
    await start(page);
    const initial = await checkFirstHome();
    const selected = initial.find(row => row.index === 1 && row.expected);
    assert.ok(selected, 'The second fixture needs a native Logo');
    const cards = page.locator(`${carousel} .jellytv-carousel__card`);
    const secondLogo = cards.nth(1).locator('img.jellytv-carousel__logo');
    await expect(secondLogo).toHaveAttribute('alt', /\S/);
    await expect(cards.nth(1)).toHaveAccessibleName(/\S/);
    await secondLogo.evaluate(image => { image.dataset.logoFixture = 'same-node'; });
    const loaded = logoRequests.length;
    const choose = index => page.evaluate(index => window[Symbol.for('jellytv.enhanced.instance')].carousel.select(index), index);
    await choose(1);
    await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(secondLogo).toHaveCSS('visibility', 'visible');
    await choose(0);
    await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(secondLogo).toHaveCSS('visibility', 'visible');
    await expect(secondLogo).toHaveAttribute('data-logo-fixture', 'same-node');
    await expect(secondLogo).toHaveAttribute('src', selected.actual);
    assert.equal(logoRequests.length, loaded, 'Selection must not request logos again');
    await page.evaluate(() => {
      const rail = window[Symbol.for('jellytv.enhanced.instance')].carousel;
      rail.previous.click(); // Wrap from the first card to the far end.
    });
    await expect(cards.last()).toHaveAttribute('aria-pressed', 'true');
    const library = page.locator('#indexPage:visible #homeTab:visible a[href*="/movies"]').last();
    await library.click();
    await expect(page).toHaveURL(/#\/movies/);
    await unmounted(page);
    await page.goBack();
    await mounted(page);
    await expect(secondLogo).toHaveCSS('visibility', 'visible');
    const selectedId = await page.locator(carousel).getAttribute('data-item-id');
    await page.locator(`${carousel} [data-focus-key="info"]`).click();
    await expect(page).toHaveURL(/#\/details\?/);
    assert.equal(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('id'), selectedId);
    await page.goBack();
    await mounted(page);
    await expect(secondLogo).toHaveCSS('visibility', 'visible');
    await page.reload();
    await checkFirstHome();
  }, true, 2);

  await scenario('carousel-logo-fallbacks', async page => {
    const gate = Promise.withResolvers();
    const images = new Map();
    let delayed = false;
    let refreshed = false;
    const title = 'Un título largo — café, 夢 y una película que sigue más allá de la última línea';
    await page.route('**/Items?**', async route => {
      if (!featured(route.request())) return route.continue();
      const response = await route.fetch();
      const data = await response.json();
      const items = data.Items.slice(0, 6);
      assert.ok(items.length >= 5, 'Include at least five featured items');
      for (const [index, behavior] of [[1, 'slow'], [2, 'missing'], [3, 'http-error'], [4, 'corrupt']]) {
        const item = items[index];
        assert.ok(item.ImageTags?.Logo, 'Fixtures need Logo tags before fault injection');
        images.set(item.Id.toLowerCase(), behavior);
        if (behavior === 'missing') {
          delete item.ImageTags.Logo;
          delete item.ParentLogoImageTag;
          delete item.ParentLogoItemId;
          item.Name = title;
        }
        if (behavior === 'slow' && refreshed) item.ImageTags.Logo = 'fixture-new-logo-tag';
      }
      await route.fulfill({ response, json: { ...data, Items: items } });
    });
    await page.route(/\/Items\/[^/]+\/Images\/Logo(?:\?|$)/i, async route => {
      const url = new URL(route.request().url());
      const id = url.pathname.split('/').at(-3).toLowerCase();
      if (url.searchParams.get('tag') === 'fixture-new-logo-tag') {
        return route.fulfill({ contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="42" height="30"><rect width="42" height="30"/></svg>' });
      }
      switch (images.get(id)) {
        case 'slow': delayed = true; await gate.promise; return route.continue().catch(() => {});
        case 'http-error': return route.fulfill({ status: 404 });
        case 'corrupt': return route.fulfill({ status: 200, contentType: 'image/png', body: 'invalid synthetic bytes' });
        case 'missing': throw new Error('Missing logo must not produce a request');
        default: return route.continue();
      }
    });
    try {
      await start(page);
      await mounted(page);
      const cards = page.locator(`${carousel} .jellytv-carousel__card`);
      const slowLogo = cards.nth(1).locator('img.jellytv-carousel__logo');
      const slowText = cards.nth(1).locator('.jellytv-carousel__card-title');
      await expect.poll(() => delayed).toBe(true);
      await expect(slowText).toHaveCSS('visibility', 'visible');
      await expect(slowLogo).toHaveCSS('visibility', 'hidden');
      await expect(cards.nth(2).locator('.jellytv-carousel__card-title')).toHaveText(title);
      assert.equal(await cards.nth(2).locator('img.jellytv-carousel__logo').getAttribute('src'), null);
      for (const index of [3, 4]) {
        const logo = cards.nth(index).locator('img.jellytv-carousel__logo');
        await expect.poll(() => logo.evaluate(node => node.complete && node.naturalWidth === 0)).toBe(true);
        await expect(logo).toHaveCSS('visibility', 'hidden');
        await expect(cards.nth(index).locator('.jellytv-carousel__card-title')).toBeVisible();
      }
      const dimensions = await cards.nth(1).boundingBox();
      gate.resolve();
      await expect(slowLogo).toHaveCSS('visibility', 'visible');
      await expect(slowText).toHaveCSS('visibility', 'hidden');
      const after = await cards.nth(1).boundingBox();
      assert.equal(after.width, dimensions.width);
      assert.equal(after.height, dimensions.height);
      await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'false');
      refreshed = true;
      await page.reload();
      await mounted(page);
      await expect(slowLogo).toHaveAttribute('src', /[?&]tag=fixture-new-logo-tag(?:&|$)/);
      await expect(slowLogo).toHaveCSS('visibility', 'visible');
      assert.equal(await slowLogo.evaluate(node => node.naturalWidth), 42);
    } finally {
      gate.resolve();
    }
  }, true, 2);

  await scenario('carousel-logo-session', async page => {
    const gate = Promise.withResolvers();
    let delayed = false;
    await page.route('**/Items?**', async route => {
      if (!featured(route.request())) return route.continue();
      const response = await route.fetch();
      const data = await response.json();
      const tag = new URL(route.request().url()).searchParams.get('userId') === lab.limited.userId ? 'before-signout' : 'after-signin';
      assert.ok(data.Items[1], 'Both lab accounts need at least two featured items');
      data.Items[1].ImageTags = { ...data.Items[1].ImageTags, Logo: tag };
      await route.fulfill({ response, json: data });
    });
    await page.route(/\/Images\/Logo\?.*tag=(?:before-signout|after-signin)/i, async route => {
      const old = new URL(route.request().url()).searchParams.get('tag') === 'before-signout';
      if (old) { delayed = true; await gate.promise; }
      const width = old ? 73 : 43;
      await route.fulfill({ contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="30"><rect width="${width}" height="30"/></svg>` }).catch(() => {});
    });
    try {
      await page.goto(new URL('#/login.html', web).href);
      await login(page, lab.limited);
      await mounted(page);
      await expect.poll(() => delayed).toBe(true);
      const logo = page.locator(`${carousel} .jellytv-carousel__card`).nth(1).locator('img.jellytv-carousel__logo');
      await expect(logo).toHaveAttribute('src', /tag=before-signout/);
      const original = await logo.elementHandle();
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page.getByRole('link', { name: 'Sign Out', exact: true }).click();
      await expect(page.locator('#txtManualName')).toBeVisible();
      await unmounted(page);
      assert.equal(await original.evaluate(node => node.isConnected || node.hasAttribute('src')), false);
      await login(page, lab.admin);
      await mounted(page);
      await expect(logo).toHaveAttribute('src', /tag=after-signin/);
      await expect(logo).toHaveCSS('visibility', 'visible');
      gate.resolve();
      assert.equal(await logo.evaluate(node => node.naturalWidth), 43);
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
