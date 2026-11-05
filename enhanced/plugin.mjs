import { JellyfinAdapter } from './adapter.mjs';
import { Hero } from './hero.mjs';
import { CardPreview } from './preview.mjs';
import { ExpandingCarousel } from './carousel.mjs';
import { homeRoute, locale } from './model.mjs';

const INSTANCE = Symbol.for('jellytv.enhanced.instance');
const HOME = '#indexPage #homeTab';
const VISIBILITY = ['class', 'style', 'hidden', 'aria-hidden', 'id'];

function visible(host) {
  if (!host.isConnected || host.closest('.hide, [hidden], [aria-hidden="true"]')) return false;
  const { width, height } = host.getBoundingClientRect();
  return width > 0 && height > 0 && getComputedStyle(host).visibility === 'visible';
}

function homeNode(node) {
  const selector = '#indexPage, #homeTab';
  return node instanceof Element && (node.matches(selector) || node.querySelector(selector));
}

export class JellyTVEnhanced {
  constructor(deps) {
    this.id = 'jellytv-enhanced';
    this.name = 'JellyTV Enhanced';
    this.type = 'jellytv-enhancement';
    if (window[INSTANCE]) return window[INSTANCE];
    if (!deps.ServerConnections?.currentApiClient || !deps.playbackManager?.play || !deps.appRouter?.showItem || !deps.events?.on) return;
    window[INSTANCE] = this;
    this.deps = deps;
    this.adapter = new JellyfinAdapter(deps);
    this.listeners = new AbortController();
    this.events = [];
    this.homes = new Set();
    this.ancestors = new Set();
    this.mutations = new MutationObserver(records => {
      if (!this.observedRoot?.isConnected || this.surfaceRemoved() ||
        records.some(record => this.homeChanged(record))) this.schedule();
    });
    this.geometry = new ResizeObserver(() => this.schedule());
    const shown = event => {
      if (event.target instanceof Element) this.shownPage = event.target.closest('#indexPage');
      else this.suspended = false;
      this.schedule();
    };
    const options = { signal: this.listeners.signal };
    window.addEventListener('viewshow', shown, options);
    window.addEventListener('pageshow', shown, options);
    window.addEventListener('hashchange', () => this.schedule(), options);
    window.addEventListener('pagehide', event => {
      // Jellyfin also bubbles pagehide from individual SPA views.
      if (event.target instanceof Element) { this.schedule(); return; }
      this.suspended = true;
      this.leaveHome();
      this.cancelFeatured();
    }, options);
    this.listen(deps.ServerConnections, 'localusersignedin', () => {
      this.signedOut = false;
      this.resetSession();
      this.schedule();
    });
    this.listen(deps.ServerConnections, 'localusersignedout', () => {
      this.signedOut = true;
      this.resetSession();
      this.leaveHome();
    });
    this.listen(deps.playbackManager, 'playbackstart', () => { this.playing = true; this.leaveHome(); });
    this.listen(deps.playbackManager, 'playbackstop', () => {
      this.playing = false;
      this.clearFeatured();
      this.schedule();
    });
    this.schedule();
  }

  listen(target, type, callback) {
    this.deps.events.on(target, type, callback);
    this.events.push(() => this.deps.events.off(target, type, callback));
  }

  schedule() {
    if (this.scheduled || this.listeners.signal.aborted) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (!this.listeners.signal.aborted) this.sync();
    });
  }

  homeChanged(record) {
    if (record.type === 'attributes') {
      return this.ancestors.has(record.target) || (record.attributeName === 'id' && homeNode(record.target));
    }
    return [...record.addedNodes, ...record.removedNodes].some(homeNode);
  }

  surfaceRemoved() {
    return [this.hero?.root, this.carousel?.root, this.notice].some(node => node && node.parentElement !== this.host);
  }

  observeHomes(homes) {
    const ancestors = new Set([document.documentElement, document.body]);
    for (const host of homes) {
      if (!this.homes.has(host)) this.geometry.observe(host);
      for (let node = host; node && !ancestors.has(node); node = node.parentElement) ancestors.add(node);
    }
    for (const host of this.homes) if (!homes.includes(host)) this.geometry.unobserve(host);
    this.homes = new Set(homes);

    const root = document.getElementById('reactRoot') || document.body;
    if (root === this.observedRoot && ancestors.size === this.ancestors.size &&
      [...ancestors].every(node => this.ancestors.has(node))) return;
    this.mutations.disconnect();
    this.ancestors = ancestors;
    this.observedRoot = root;
    // The native view tree can change without navigation. Only react to view
    // structure and visibility, including the ancestors of parked Home tabs.
    this.mutations.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: VISIBILITY });
    for (const node of ancestors) {
      if (root.contains(node)) continue;
      this.mutations.observe(node, { childList: true, attributes: true, attributeFilter: VISIBILITY });
    }
  }

  sync() {
    const session = this.signedOut ? null : this.adapter.session();
    if (this.session && !this.sameSession(this.session, session)) this.resetSession();
    this.session = session;
    if (!session || !document.body || !homeRoute(location.hash) || this.suspended || this.playing ||
      document.body.classList.contains('dashboardDocument')) {
      this.leaveHome();
      return;
    }
    const homes = [...document.querySelectorAll(HOME)];
    this.observeHomes(homes);
    if (this.shownPage && !homes.some(host => host.closest('#indexPage') === this.shownPage)) this.shownPage = null;
    const shown = homes.filter(visible).reverse();
    const host = shown.find(candidate => candidate.closest('#indexPage') === this.shownPage) || shown[0] || null;
    if (host !== this.host || this.surfaceRemoved()) {
      this.unmount();
      if (host) {
        this.host = host;
        this.mount = new AbortController();
        new CardPreview({ host, adapter: this.adapter, session, signal: this.mount.signal });
      }
    }
    if (!this.host || this.hero || this.notice) return;
    if (this.failed) this.showRetry();
    else if (this.cache?.until > Date.now()) this.render(session, this.cache.items);
    else if (!this.pending) this.load(session);
  }

  sameSession(a, b) {
    return a.key === b?.key && a.client === b.client;
  }

  async load(session) {
    // One bounded request per session, shared by every replacement Home.
    const request = new AbortController();
    this.pending = request;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; request.abort(); }, 12000);
    try {
      const items = await this.adapter.featured(session, request.signal, 6);
      if (this.pending === request && !request.signal.aborted && this.sameSession(session, this.adapter.session())) {
        this.cache = { items, until: Date.now() + 60000 };
      }
    } catch (error) {
      if (this.pending === request && (timedOut || error.name !== 'AbortError')) this.failed = true;
    } finally {
      clearTimeout(timeout);
      if (this.pending === request) {
        this.pending = null;
        this.schedule();
      }
    }
  }

  render(session, items) {
    if (!items.length) return;
    const host = this.host, signal = this.mount.signal;
    this.hero = new Hero({ host, items, adapter: this.adapter, session, signal });
    this.carousel = new ExpandingCarousel({ host, after: this.hero.root, items, adapter: this.adapter, session, signal });
    if (this.returnFocus?.key === session.key) {
      const restore = this.returnFocus;
      this.returnFocus = null;
      const index = items.findIndex(item => item.Id === restore.itemId);
      const surface = restore.surface === 'carousel' ? this.carousel : this.hero;
      if (restore.surface === 'carousel') surface.select(Math.max(0, index), { animate: false });
      else surface.show(Math.max(0, index));
      requestAnimationFrame(() => {
        if (signal.aborted || !visible(host) || surface.root.parentElement !== host) return;
        const control = [...surface.root.querySelectorAll('[data-focus-key]')].find(node => node.dataset.focusKey === restore.control);
        (control || surface.play).focus({ preventScroll: true });
      });
    }
  }

  showRetry() {
    const { labels } = locale();
    this.notice = document.createElement('div');
    this.notice.className = 'jellytv-notice';
    const message = document.createElement('span'); message.textContent = labels.unavailable;
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'jellytv-button'; retry.textContent = labels.retry;
    retry.addEventListener('click', () => {
      this.failed = false;
      this.notice.remove();
      this.notice = null;
      this.schedule();
    }, { once: true, signal: this.mount.signal });
    this.notice.append(message, retry); this.host.prepend(this.notice);
  }

  unmount() {
    const focused = this.carousel && (this.carousel.root.contains(document.activeElement) || this.carousel.busy || this.carousel.navigationIntent)
      ? this.carousel : this.hero;
    if (focused && (focused.root.contains(document.activeElement) || focused.busy || focused.navigationIntent)) {
      this.returnFocus = { key: this.session?.key, itemId: focused.items[focused.index].Id,
        surface: focused === this.carousel ? 'carousel' : 'hero', control: focused.navigationIntent || focused.lastFocus || 'play' };
    }
    this.mount?.abort(); this.mount = null;
    this.carousel = null;
    this.hero?.destroy(); this.hero = null;
    this.notice?.remove(); this.notice = null;
    this.host = null;
  }

  leaveHome() {
    this.mutations.disconnect();
    this.geometry.disconnect();
    this.observedRoot = this.shownPage = null;
    this.homes.clear();
    this.ancestors.clear();
    this.unmount();
  }

  cancelFeatured() {
    this.pending?.abort();
    this.pending = null;
  }

  clearFeatured() {
    this.cancelFeatured();
    this.cache = null;
    this.failed = false;
  }

  resetSession() {
    this.unmount();
    this.session = null;
    this.returnFocus = null;
    this.clearFeatured();
  }

  destroy() {
    this.listeners.abort(); this.events.forEach(off => off()); this.events = [];
    this.leaveHome();
    this.resetSession();
    delete window[INSTANCE];
  }
}

window.JellyTVEnhanced = async () => JellyTVEnhanced;
