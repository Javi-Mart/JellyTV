import { JellyfinAdapter } from './adapter.mjs';
import { Hero } from './hero.mjs';
import { CardPreview } from './preview.mjs';
import { homeRoute, locale } from './model.mjs';

const INSTANCE = Symbol.for('jellytv.enhanced.instance');

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
    this.cache = null;
    this.generation = 0;
    this.sync = this.sync.bind(this);
    document.addEventListener('viewshow', this.sync, { signal: this.listeners.signal });
    document.addEventListener('pageshow', this.sync, { signal: this.listeners.signal });
    window.addEventListener('hashchange', this.sync, { signal: this.listeners.signal });
    window.addEventListener('pagehide', () => this.unmount(), { signal: this.listeners.signal });
    window.addEventListener('pageshow', this.sync, { signal: this.listeners.signal });
    this.listen(deps.ServerConnections, 'localusersignedin', () => { this.cache = null; this.unmount(); this.returnFocus = null; queueMicrotask(this.sync); });
    this.listen(deps.ServerConnections, 'localusersignedout', () => { this.cache = null; this.unmount(); this.returnFocus = null; });
    this.listen(deps.playbackManager, 'playbackstart', () => { this.playing = true; this.unmount(); });
    this.listen(deps.playbackManager, 'playbackstop', () => { this.playing = false; this.cache = null; queueMicrotask(this.sync); });
    queueMicrotask(this.sync);
  }

  listen(target, type, callback) {
    this.deps.events.on(target, type, callback);
    this.events.push(() => this.deps.events.off(target, type, callback));
  }

  sync() {
    const session = this.adapter.session();
    const host = document.querySelector('#indexPage #homeTab');
    const valid = session && homeRoute(location.hash) && host && !document.body.classList.contains('dashboardDocument') && !this.playing;
    if (!valid) { this.unmount(); return; }
    if (this.host === host && this.sessionKey === session.key) return;
    this.unmount();
    this.host = host;
    this.sessionKey = session.key;
    this.request = new AbortController();
    this.previewRequest = new AbortController();
    this.preview = new CardPreview({ host, adapter: this.adapter, session, signal: this.previewRequest.signal });
    const generation = this.generation;
    // Observe only this Home's visibility and direct children; never the document subtree.
    this.observer = new MutationObserver(() => {
      if (!host.isConnected || host.classList.contains('hide') || host.hidden) this.hero?.pause();
    });
    this.observer.observe(host, { attributes: true, attributeFilter: ['class', 'hidden'], childList: true });
    this.load(session, generation).catch(error => {
      if (error.name !== 'AbortError' && generation === this.generation) this.showRetry(session, generation);
    });
  }

  async load(session, generation) {
    this.notice?.remove(); this.notice = null;
    const request = this.request;
    const signal = request.signal;
    // A deadline also aborts the actual fetch rather than leaving a timeout race in flight.
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; request.abort(); }, 12000);
    let items;
    try {
      items = this.cache?.key === session.key && this.cache.until > Date.now()
        ? this.cache.items
        : await this.adapter.featured(session, signal, 6);
    } catch (error) {
      if (timedOut) throw new Error('Featured request timed out', { cause: error });
      throw error;
    } finally { clearTimeout(timeout); }
    if (signal.aborted || generation !== this.generation || !this.host?.isConnected || this.adapter.session()?.key !== session.key) return;
    this.cache = { key: session.key, items, until: Date.now() + 60000 };
    if (!items.length) return;
    this.hero = new Hero({ host: this.host, items, adapter: this.adapter, session, signal });
    if (this.returnFocus?.key === session.key) {
      const restore = this.returnFocus;
      this.returnFocus = null;
      const index = items.findIndex(item => item.Id === restore.itemId);
      this.hero.show(Math.max(0, index));
      const hero = this.hero;
      requestAnimationFrame(() => {
        if (signal.aborted || !hero.root.isConnected) return;
        const control = [...hero.root.querySelectorAll('[data-focus-key]')].find(node => node.dataset.focusKey === restore.control);
        (control || hero.play).focus({ preventScroll: true });
      });
    }
  }

  showRetry(session, generation) {
    if (!this.host?.isConnected) return;
    const { labels } = locale();
    this.notice = document.createElement('div');
    this.notice.className = 'jellytv-notice';
    const message = document.createElement('span'); message.textContent = labels.unavailable;
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'jellytv-button'; retry.textContent = labels.retry;
    retry.addEventListener('click', () => {
      this.request.abort(); this.request = new AbortController();
      this.load(session, generation).catch(error => { if (error.name !== 'AbortError' && generation === this.generation) this.showRetry(session, generation); });
    }, { once: true });
    this.notice.append(message, retry); this.host.prepend(this.notice);
  }

  unmount() {
    if (this.hero && (this.hero.root.contains(document.activeElement) || this.hero.busy || this.hero.navigationIntent)) {
      this.returnFocus = { key: this.sessionKey, itemId: this.hero.items[this.hero.index].Id, control: this.hero.navigationIntent || this.hero.lastFocus || 'play' };
    }
    this.generation++;
    this.request?.abort(); this.request = null;
    this.previewRequest?.abort(); this.previewRequest = null;
    this.preview?.destroy(); this.preview = null;
    this.observer?.disconnect(); this.observer = null;
    this.hero?.destroy(); this.hero = null;
    this.notice?.remove(); this.notice = null;
    this.host = null; this.sessionKey = null;
  }

  destroy() {
    this.unmount(); this.listeners.abort(); this.events.forEach(off => off()); this.events = []; this.cache = null;
    delete window[INSTANCE];
  }
}

window.JellyTVEnhanced = async () => JellyTVEnhanced;
