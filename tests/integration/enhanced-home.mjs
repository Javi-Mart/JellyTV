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
      } while (now - start < 410);
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
} catch (error) {
  console.error(error.message.replace(/\b[0-9a-f]{32,}\b/gi, '<id>').split('\n').slice(0, 12).join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
