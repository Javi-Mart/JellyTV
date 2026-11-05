import { candidates, locale, metadata, progress, resumeTicks, text } from './model.mjs';
import { favoriteState, icon, timing } from './controls.mjs';

let sequence = 0;
const copy = {
  en: { heading: 'In your library', select: 'Select', count: 'of', summary: 'No summary available.',
    hint: 'Use the arrow keys to explore. Press Down for actions.', details: 'Selected title' },
  es: { heading: 'En tu biblioteca', select: 'Seleccionar', count: 'de', summary: 'Sin sinopsis disponible.',
    hint: 'Usa las flechas para explorar. Pulsa abajo para las acciones.', details: 'Título seleccionado' }
};

function node(tag, className, value) {
  const element = document.createElement(tag);
  element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
}

function control(label, value, className = '') {
  const element = node('button', `jellytv-button ${className}`, value);
  element.type = 'button'; element.setAttribute('aria-label', label);
  return element;
}

/** A bounded native-data rail. It owns only its root, listeners and requests.
 * It shares the Home query with Hero and never changes Jellyfin's native rows. */
export class ExpandingCarousel {
  constructor({ host, after, items, adapter, session, signal }) {
    Object.assign(this, { host, adapter, session, signal }, locale());
    this.items = candidates(items, 6);
    this.words = copy[this.language.toLowerCase().startsWith('es') ? 'es' : 'en'];
    this.index = 0; this.focusIndex = 0; this.animations = [];
    this.controller = new AbortController();
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.fine = matchMedia('(hover: hover) and (pointer: fine)');
    this.tv = document.documentElement.classList.contains('layout-tv');
    const id = `jellytv-library-carousel-${++sequence}`;
    this.root = node('section', 'jellytv-carousel');
    this.root.dataset.jellytv = 'carousel'; this.root.setAttribute('aria-labelledby', `${id}-heading`);
    const header = node('div', 'jellytv-carousel__header');
    const heading = node('h2', 'jellytv-carousel__heading', this.words.heading); heading.id = `${id}-heading`;
    const controls = node('div', 'jellytv-carousel__controls');
    this.counter = node('span', 'jellytv-carousel__counter'); this.counter.setAttribute('aria-hidden', 'true');
    this.previous = control(this.labels.previous, '‹', 'jellytv-button--icon');
    this.next = control(this.labels.next, '›', 'jellytv-button--icon');
    controls.append(this.counter, this.previous, this.next); header.append(heading, controls);
    this.rail = node('div', 'jellytv-carousel__rail');
    this.rail.setAttribute('role', 'group'); this.rail.setAttribute('aria-label', this.words.heading);
    const hint = node('p', 'jellytv-visually-hidden', this.words.hint); hint.id = `${id}-hint`;
    this.rail.setAttribute('aria-describedby', hint.id);
    this.panel = node('div', 'jellytv-carousel__panel'); this.panel.id = `${id}-details`;
    this.panel.setAttribute('role', 'group'); this.panel.setAttribute('aria-label', this.words.details);
    this.heading = node('h3', 'jellytv-carousel__title');
    this.meta = node('p', 'jellytv-carousel__metadata');
    this.overview = node('p', 'jellytv-carousel__overview');
    this.copy = node('div', 'jellytv-carousel__copy');
    this.copy.append(this.heading, this.meta, this.overview);
    this.actions = node('div', 'jellytv-carousel__actions');
    this.play = control(this.labels.play, this.labels.play, 'jellytv-button--primary');
    this.info = control(this.labels.info, this.labels.info, 'jellytv-button--secondary');
    this.favorite = control(this.labels.favorite, '', 'jellytv-button--icon jellytv-button--favorite');
    this.favorite.append(icon('heart'));
    this.actions.append(this.play, this.info, this.favorite);
    for (const [key, element] of Object.entries({ play: this.play, info: this.info, favorite: this.favorite })) element.dataset.focusKey = key;
    this.bar = node('progress', 'jellytv-carousel__progress'); this.bar.max = 100;
    this.bar.setAttribute('aria-label', this.labels.progress);
    this.status = node('p', 'jellytv-carousel__status'); this.status.setAttribute('role', 'status');
    this.announcement = node('p', 'jellytv-visually-hidden'); this.announcement.setAttribute('role', 'status');
    this.panel.append(this.copy, this.actions, this.bar, this.status);
    this.root.append(header, hint, this.rail, this.panel, this.announcement);
    this.cards = this.items.map((item, index) => this.makeCard(item, index));
    this.rail.append(...this.cards.map(card => card.root));
    if (after?.parentElement === host) after.after(this.root); else host.prepend(this.root);
    if (!this.items.length) { this.root.hidden = true; return; }

    this.on(this.previous, 'click', () => this.select(this.requestedIndex - 1, { announce: true }));
    this.on(this.next, 'click', () => this.select(this.requestedIndex + 1, { announce: true }));
    this.on(this.play, 'click', () => this.action(this.play, item => adapter.play(session, item, this.operation.signal)));
    this.on(this.info, 'click', () => {
      if (this.busy || !this.valid()) return;
      this.pause(); this.navigationIntent = 'info'; adapter.details(session, this.items[this.index]);
    });
    this.on(this.favorite, 'click', () => this.action(this.favorite, item => adapter.favorite(session, item, this.operation.signal)));
    this.on(this.root, 'focusin', event => {
      if (event.target.dataset.focusKey) this.lastFocus = event.target.dataset.focusKey;
    });
    this.on(this.rail, 'keydown', event => this.key(event));
    this.on(this.actions, 'keydown', event => {
      if (event.key === 'Escape' || event.key === 'ArrowUp') {
        event.preventDefault(); event.stopPropagation(); this.cards[this.index].root.focus({ preventScroll: true });
      }
    });
    this.on(this.rail, 'pointermove', event => {
      if (this.tv || !this.fine.matches || event.pointerType !== 'mouse') return;
      // Geometry changes can fire pointerover without a physical mouse move.
      // Only movement establishes new intent, avoiding a chain of expansions.
      if (this.pointer?.x === event.clientX && this.pointer?.y === event.clientY) return;
      this.pointer = { x: event.clientX, y: event.clientY };
      const card = event.target.closest('.jellytv-carousel__card');
      if (card) this.queue(Number(card.dataset.index), 300, 'pointer');
    });
    this.on(this.rail, 'pointerout', event => {
      const card = event.target.closest('.jellytv-carousel__card');
      if (card && !card.contains(event.relatedTarget) && this.intent?.source === 'pointer') this.cancelIntent();
    });
    this.on(this.rail, 'pointerleave', () => { this.pointer = null; if (this.intent?.source === 'pointer') this.cancelIntent(); });
    this.on(this.rail, 'focusin', event => {
      const card = event.target.closest('.jellytv-carousel__card');
      if (!card) return;
      this.roving(Number(card.dataset.index));
      if (performance.now() < (this.suppressClickUntil || 0)) return;
      this.queue(Number(card.dataset.index), this.tv ? 650 : 0, 'focus');
    });
    this.on(this.rail, 'focusout', event => {
      if (!this.rail.contains(event.relatedTarget) && this.intent?.source === 'focus') this.cancelIntent();
    });
    this.on(this.rail, 'pointerdown', event => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        // Jellyfin's surrounding tab gesture also listens for touch starts.
        // Keep this horizontal gesture local without cancelling native pan-y
        // or pinch zoom (neither handler calls preventDefault).
        event.stopPropagation();
        this.touch = { x: event.clientX, y: event.clientY, id: event.pointerId };
      }
    });
    this.on(this.rail, 'touchstart', event => event.stopPropagation());
    this.on(this.rail, 'pointerup', event => {
      if (!this.touch || this.touch.id !== event.pointerId) return;
      const dx = event.clientX - this.touch.x, dy = event.clientY - this.touch.y; this.touch = null;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        this.suppressClickUntil = performance.now() + 400;
        this.select(this.requestedIndex + (dx < 0 ? 1 : -1) * (this.rtl() ? -1 : 1), { announce: true });
      } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
        // Some touch engines rely on the parent's synthetic click handler,
        // which must not receive this rail's gesture. Commit a true tap here;
        // suppress a later compatibility click after the card changes width.
        const card = event.target.closest('.jellytv-carousel__card');
        if (card) {
          this.suppressClickUntil = performance.now() + 400;
          const index = Number(card.dataset.index);
          this.select(index, { announce: true }); this.roving(index);
        }
      }
    });
    this.on(this.rail, 'pointercancel', () => { this.touch = null; });
    this.on(window, 'resize', () => { this.pause({ commitPending: true }); this.ensureVisible(this.index); });
    this.on(document, 'visibilitychange', () => { if (document.hidden) this.pause(); });
    this.on(this.reduced, 'change', () => this.pause({ commitPending: true }));
    this.on(adapter.userData, 'change', event => {
      if (event.detail.key !== session.key || !this.valid()) return;
      const item = this.items.find(item => item.Id === event.detail.id);
      if (item) { item.UserData = { ...item.UserData, ...event.detail.userData }; this.updateFavorite(true); }
    });
    signal.addEventListener('abort', () => this.destroy(), { once: true, signal: this.controller.signal });
    this.select(0, { animate: false, scroll: false });
    if (signal.aborted) this.destroy();
  }

  on(target, type, callback) { target.addEventListener(type, callback, { signal: this.controller.signal }); }
  valid() { return !this.destroyed && !this.signal.aborted && this.adapter.session()?.key === this.session.key; }
  get requestedIndex() { return this.pending?.index ?? this.index; }
  rtl() { return getComputedStyle(this.root).direction === 'rtl'; }
  roving(index) {
    this.focusIndex = index;
    this.cards.forEach((card, position) => { card.root.tabIndex = position === index ? 0 : -1; });
  }

  makeCard(item, index) {
    const root = node('button', 'jellytv-carousel__card'); root.type = 'button';
    root.dataset.index = String(index); root.tabIndex = index === 0 ? 0 : -1;
    root.setAttribute('aria-label', `${this.words.select}: ${text(item.Name, 200)}`);
    root.setAttribute('aria-controls', this.panel.id);
    const poster = node('img', 'jellytv-carousel__poster'); poster.alt = ''; poster.loading = 'lazy'; poster.decoding = 'async';
    const landscape = node('img', 'jellytv-carousel__landscape'); landscape.alt = ''; landscape.loading = 'lazy'; landscape.decoding = 'async';
    const logo = node('img', 'jellytv-carousel__logo'); logo.alt = text(item.Name, 200); logo.decoding = 'async';
    logo.setAttribute('aria-hidden', 'true');
    const title = node('span', 'jellytv-carousel__card-title', text(item.Name, 160)); title.setAttribute('aria-hidden', 'true');
    const compactRole = ['Primary', 'Thumb', 'Art'].find(role => this.adapter.image(this.session, item, role, 480));
    if (compactRole) {
      poster.src = this.adapter.image(this.session, item, compactRole, 480);
      poster.dataset.artworkRole = compactRole;
      root.classList.toggle('is-secondary-art', compactRole !== 'Primary');
      this.on(poster, 'load', () => root.classList.add('has-poster'));
      this.on(poster, 'error', () => root.classList.remove('has-poster'));
    }
    this.on(landscape, 'load', () => root.classList.add('has-landscape'));
    this.on(landscape, 'error', () => root.classList.remove('has-landscape'));
    const card = { root, poster, landscape, logo, loaded: false, logoReady: false };
    this.on(logo, 'load', async () => {
      try { await logo.decode?.(); } catch { return; }
      if (this.controller.signal.aborted) return;
      card.logoReady = logo.naturalWidth > 0 && logo.naturalHeight > 0;
      this.updateCardLogo(card);
    });
    this.on(logo, 'error', () => { card.logoReady = false; this.updateCardLogo(card); });
    const logoUrl = this.adapter.image(this.session, item, 'Logo', 640);
    if (logoUrl) logo.src = logoUrl;
    root.append(poster, landscape, node('span', 'jellytv-carousel__shade'), logo, title);
    this.on(root, 'click', event => {
      if (performance.now() < (this.suppressClickUntil || 0)) { event.preventDefault(); return; }
      this.select(index, { announce: true }); this.roving(index);
    });
    return card;
  }

  updateCardLogo(card) {
    if (!card.resize) card.root.classList.toggle('has-logo', card.logoReady);
  }

  queue(index, delay, source) {
    if (index === this.requestedIndex || this.busy || !this.valid()) { this.cancelIntent(); return; }
    if (this.intent?.index === index && this.intent.source === source) return;
    this.cancelIntent(); this.intent = { index, source };
    if (!delay) { this.select(index, { announce: source === 'focus' }); return; }
    this.timer = setTimeout(() => this.select(index, { announce: source === 'focus' }), delay);
  }

  cancelIntent() { clearTimeout(this.timer); this.timer = null; this.intent = null; }

  key(event) {
    this.suppressClickUntil = 0;
    const card = event.target.closest('.jellytv-carousel__card');
    if (!card) return;
    const index = Number(card.dataset.index);
    if (event.key === 'ArrowDown') {
      event.preventDefault(); event.stopPropagation(); this.select(index, { animate: false, announce: true }); this.play.focus({ preventScroll: true });
    } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const direction = (event.key === 'ArrowRight' ? 1 : -1) * (this.rtl() ? -1 : 1);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? this.items.length - 1 : (index + direction + this.items.length) % this.items.length;
      this.roving(next); this.cards[next].root.focus({ preventScroll: true });
      this.ensureVisible(next); this.queue(next, this.tv ? 650 : 0, 'focus');
    } else if (event.key === 'Escape') { this.pause(); }
  }

  ensureVisible(index) {
    if (!this.root.isConnected || !this.cards[index]) return;
    const frame = this.rail.getBoundingClientRect(), item = this.cards[index].root.getBoundingClientRect();
    // Change only the rail's scroll offset. scrollIntoView would also move Home.
    if (item.left < frame.left + 8) this.rail.scrollLeft += item.left - frame.left - 8;
    else if (item.right > frame.right - 8) this.rail.scrollLeft += item.right - frame.right + 8;
  }

  select(index, { animate = true, announce = false, scroll = true } = {}) {
    if (!this.valid() || this.busy || !this.items.length) return;
    this.cancelIntent();
    const selected = (index + this.items.length) % this.items.length;
    if (this.root.dataset.itemId && selected === this.index) {
      if (this.pending) this.cancelPanel();
      return;
    }
    const moving = animate && !this.reduced.matches && this.root.dataset.itemId && this.copy.animate;
    const choice = { index: selected, announce, scroll };
    if (!moving) {
      this.cancelPanel();
      this.commitSelection(choice);
      return;
    }
    if (this.pending) {
      if (this.pending.index === selected) choice.announce ||= this.pending.announce;
      this.pending = choice;
      return;
    }
    const style = getComputedStyle(this.copy);
    const opacity = Number(style.opacity);
    const exit = timing(style, '--motion-panel-exit', '--ease-exit');
    const enter = timing(style, '--motion-normal', '--ease-enter');
    this.cancelPanel();
    if (!exit.duration) { this.commitSelection(choice, true); return; }
    this.pending = choice;
    const handoff = this.copy.animate([{ opacity }, { opacity: 0 }], { ...exit, duration: exit.duration * opacity, fill: 'forwards' });
    this.panelMotion = handoff;
    handoff.onfinish = () => {
      if (this.panelMotion !== handoff || !this.valid()) return;
      const latest = this.pending;
      this.cancelPanel();
      this.commitSelection(latest, true);
      const entry = this.copy.animate([{ opacity: 0 }, { opacity: 1 }], enter);
      this.panelMotion = entry;
      entry.onfinish = () => { if (this.panelMotion === entry) this.panelMotion = null; };
    };
  }

  cancelPanel() {
    const motion = this.panelMotion;
    this.panelMotion = null;
    this.pending = null;
    motion?.cancel();
  }

  cancelResize() {
    this.animations.forEach(animation => animation.cancel());
    this.animations = [];
    this.cards.forEach(card => { card.resize = null; });
  }

  commitSelection({ index, announce, scroll }, moving = false) {
    // Read the interpolated widths before cancelling an interrupted selection.
    const before = moving ? this.cards.map(card => card.root.getBoundingClientRect().width) : [];
    this.cancelResize();
    this.index = index;
    const item = this.items[this.index], active = this.cards[this.index];
    this.root.dataset.itemId = item.Id;
    this.cards.forEach((card, position) => {
      card.root.classList.toggle('is-active', position === this.index);
      card.root.setAttribute('aria-pressed', String(position === this.index));
    });
    if (!this.rail.contains(document.activeElement)) this.roving(this.index);
    if (!active.loaded) {
      active.loaded = true;
      const landscapeRole = ['Backdrop', 'Thumb'].find(role => this.adapter.image(this.session, item, role, 1280));
      if (landscapeRole) { active.landscape.dataset.artworkRole = landscapeRole; active.landscape.src = this.adapter.image(this.session, item, landscapeRole, 1280); }
    }
    this.heading.textContent = text(item.Name, 200);
    this.meta.textContent = metadata(item, this.language).join(' · ');
    this.overview.textContent = text(item.Overview, 500) || this.words.summary;
    this.overview.classList.toggle('is-empty', !text(item.Overview));
    const playLabel = item.Type !== 'Series' && resumeTicks(item) > 0 ? this.labels.resume : this.labels.play;
    this.play.textContent = playLabel; this.play.setAttribute('aria-label', playLabel);
    this.bar.value = progress(item); this.bar.classList.toggle('is-empty', this.bar.value <= 0);
    this.bar.setAttribute('aria-hidden', String(this.bar.value <= 0));
    this.counter.textContent = `${this.index + 1} / ${this.items.length}`;
    this.previous.disabled = this.items.length < 2; this.next.disabled = this.items.length < 2;
    this.status.textContent = ''; this.updateFavorite();
    if (scroll) this.ensureVisible(this.index);
    if (moving) {
      const style = getComputedStyle(this.root);
      const motion = timing(style, '--motion-select', '--ease-standard');
      if (motion.duration) {
        const after = this.cards.map(card => card.root.getBoundingClientRect().width);
        this.cards.forEach((card, position) => {
          if (Math.abs(before[position] - after[position]) <= 1) return;
          const resize = card.root.animate([
            { flexBasis: `${before[position]}px` }, { flexBasis: `${after[position]}px` }
          ], motion);
          card.resize = resize;
          this.animations.push(resize);
          resize.onfinish = () => {
            if (card.resize !== resize) return;
            card.resize = null;
            this.updateCardLogo(card);
          };
        });
      }
    }
    this.cards.forEach(card => this.updateCardLogo(card));
    if (announce) this.announcement.textContent = `${this.index + 1} ${this.words.count} ${this.items.length}: ${text(item.Name, 200)}`;
  }

  updateFavorite(animate = false) {
    favoriteState(this.favorite, Boolean(this.items[this.index]?.UserData?.IsFavorite), this.labels, animate);
  }

  async action(control, callback) {
    if (this.busy || !this.valid()) return;
    this.pause(); this.busy = true; this.operation = new AbortController();
    this.root.setAttribute('aria-busy', 'true'); control.disabled = true; control.setAttribute('aria-busy', 'true'); this.status.textContent = '';
    try { await callback(this.items[this.index]); }
    catch (error) { if (error.name !== 'AbortError' && this.valid()) this.status.textContent = this.labels.error; }
    finally {
      this.busy = false;
      if (!this.destroyed) {
        control.disabled = false; control.removeAttribute('aria-busy'); this.root.removeAttribute('aria-busy'); this.updateFavorite();
      }
      this.operation = null;
    }
  }

  pause({ commitPending = false } = {}) {
    const pending = commitPending && this.pending;
    this.cancelIntent();
    this.touch = null;
    this.cancelPanel();
    this.cancelResize();
    if (pending && this.valid()) this.commitSelection(pending);
    else this.cards.forEach(card => this.updateCardLogo(card));
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; this.pause(); this.operation?.abort(); this.controller.abort();
    this.cards.forEach(card => [card.poster, card.landscape, card.logo].forEach(image => image.removeAttribute('src')));
    this.root.remove();
  }
}
