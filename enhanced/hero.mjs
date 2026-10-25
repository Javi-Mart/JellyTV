import { locale, metadata, progress, resumeTicks, secondaryArtwork, text } from './model.mjs';

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function button(label, content, className = '') {
  const node = element('button', `jellytv-button ${className}`, content);
  node.type = 'button';
  node.setAttribute('aria-label', label);
  return node;
}

const paths = {
  play: 'M8 5v14l11-7z',
  info: 'M12 8h.01M12 11v6M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  left: 'm15 5-7 7 7 7', right: 'm9 5 7 7-7 7'
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[name]);
  path.setAttribute('fill', name === 'play' ? 'currentColor' : 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.8');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

/** Owns only its root, listeners, timer and requests. Never modifies Jellyfin overlays. */
export class Hero {
  constructor({ host, items, adapter, session, signal, interval = 10000 }) {
    Object.assign(this, { host, items, adapter, session, signal, interval });
    Object.assign(this, locale());
    this.index = 0;
    this.rotating = false;
    this.imageGeneration = 0;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.controller = new AbortController();
    this.root = element('section', 'jellytv-hero');
    this.root.dataset.jellytv = 'hero';
    this.root.setAttribute('aria-roledescription', 'carousel');
    this.root.setAttribute('aria-label', this.labels.featured);
    this.root.setAttribute('aria-busy', 'false');
    this.art = element('div', 'jellytv-hero__art');
    this.art.setAttribute('aria-hidden', 'true');
    this.images = [element('img', 'jellytv-hero__backdrop'), element('img', 'jellytv-hero__backdrop')];
    this.images.forEach(image => { image.alt = ''; image.decoding = 'async'; this.art.append(image); });
    this.root.append(this.art, element('div', 'jellytv-hero__shade'));
    this.secondary = element('img', 'jellytv-hero__secondary');
    this.secondary.alt = ''; this.secondary.hidden = true;
    this.root.append(this.secondary);
    this.body = element('div', 'jellytv-hero__body');
    this.kicker = element('p', 'jellytv-hero__eyebrow', this.labels.featured);
    this.logo = element('img', 'jellytv-hero__logo');
    this.logo.alt = ''; this.logo.hidden = true;
    this.heading = element('h2', 'jellytv-hero__title');
    this.meta = element('p', 'jellytv-hero__meta');
    this.description = element('p', 'jellytv-hero__description');
    this.actions = element('div', 'jellytv-hero__actions focuscontainer-x');
    this.play = button(this.labels.play, '', 'jellytv-button--primary');
    this.playLabel = element('span', '', this.labels.play);
    this.play.append(icon('play'), this.playLabel);
    this.info = button(this.labels.info, '', 'jellytv-button--secondary');
    this.info.append(icon('info'), element('span', '', this.labels.info));
    this.favorite = button(this.labels.favorite, '', 'jellytv-button--icon');
    this.favorite.append(icon('heart'));
    this.actions.append(this.play, this.info, this.favorite);
    for (const [key, node] of Object.entries({ play: this.play, info: this.info, favorite: this.favorite })) node.dataset.focusKey = key;
    this.bar = element('progress', 'jellytv-hero__progress');
    this.bar.max = 100;
    this.bar.setAttribute('aria-label', this.labels.progress);
    this.status = element('p', 'jellytv-hero__status');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.body.append(this.kicker, this.logo, this.heading, this.meta, this.description, this.actions, this.bar, this.status);
    this.root.append(this.body);
    this.navigation = element('div', 'jellytv-hero__navigation focuscontainer-x');
    this.rotate = button(this.labels.rotate, '▷', 'jellytv-button--icon');
    this.rotate.dataset.focusKey = 'rotate';
    this.previous = button(this.labels.previous, '', 'jellytv-button--icon');
    this.previous.dataset.focusKey = 'previous';
    this.previous.append(icon('left'));
    this.next = button(this.labels.next, '', 'jellytv-button--icon');
    this.next.dataset.focusKey = 'next';
    this.next.append(icon('right'));
    this.dots = element('div', 'jellytv-hero__dots');
    this.dots.setAttribute('role', 'group');
    this.dots.setAttribute('aria-label', this.labels.featured);
    this.dotButtons = items.map((item, index) => {
      const dot = button(`${this.labels.slide} ${index + 1}: ${text(item.Name)}`, '', 'jellytv-hero__dot');
      dot.dataset.focusKey = `dot-${index}`;
      dot.append(element('span'));
      this.on(dot, 'click', () => { this.pause(); this.show(index); });
      this.dots.append(dot);
      return dot;
    });
    // Rotation control precedes changing content in tab order (WAI carousel pattern).
    this.root.prepend(this.rotate);
    this.rotate.classList.add('jellytv-hero__rotation');
    this.navigation.append(this.previous, this.dots, this.next);
    this.root.append(this.navigation);
    this.navigation.hidden = items.length < 2;
    this.rotate.hidden = items.length < 2;
    this.on(this.previous, 'click', () => { this.pause(); this.show(this.index - 1); });
    this.on(this.next, 'click', () => { this.pause(); this.show(this.index + 1); });
    this.on(this.rotate, 'click', () => {
      if (this.rotating) this.pause();
      else if (!this.reduced.matches) { this.rotating = true; this.updateRotation(); this.schedule(); }
    });
    this.on(this.root, 'focusin', event => {
      this.lastFocus = event.target.dataset.focusKey;
      if (event.target !== this.rotate) this.pause();
    });
    this.on(this.root, 'pointerenter', event => { if (event.pointerType === 'mouse') this.pause(); });
    this.on(document, 'visibilitychange', () => { if (document.hidden) this.pause(); });
    this.on(this.reduced, 'change', () => { if (this.reduced.matches) this.pause(); this.updateRotation(); });
    this.on(this.root, 'pointerdown', event => {
      this.pause();
      // TV scrollManager centers focused controls. Defer mouse focus until click,
      // otherwise Firefox moves the button between pointerdown and pointerup.
      if (document.documentElement.classList.contains('layout-tv') && event.pointerType === 'mouse' && event.button === 0 && event.target.closest('button')) event.preventDefault();
      if (event.target.closest('button') || event.pointerType === 'mouse') return;
      this.touch = { x: event.clientX, y: event.clientY };
    });
    this.on(this.root, 'click', event => {
      const control = event.target.closest('button');
      if (document.documentElement.classList.contains('layout-tv') && event.pointerType === 'mouse' && control?.isConnected && !control.disabled) control.focus({ preventScroll: true });
    });
    this.on(this.root, 'pointerup', event => {
      if (!this.touch) return;
      const dx = event.clientX - this.touch.x, dy = event.clientY - this.touch.y;
      this.touch = null;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) this.show(this.index + (dx < 0 ? 1 : -1));
    });
    this.on(this.root, 'pointercancel', () => { this.touch = null; });
    this.on(this.root, 'keydown', event => {
      // TV inputManager owns directional navigation. Desktop dots support arrow selection.
      if (document.documentElement.classList.contains('layout-tv') || !this.dots.contains(event.target)) return;
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); this.pause();
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : this.index + (event.key === 'ArrowLeft' ? -1 : 1);
        this.show(index); this.dotButtons[this.index].focus();
      }
    });
    this.on(this.play, 'click', () => this.action(this.play, item => adapter.play(session, item, signal)));
    this.on(this.info, 'click', () => {
      this.pause();
      // The router removes focus before viewshow is emitted. Remember the action now.
      this.navigationIntent = 'info';
      adapter.details(session, this.items[this.index]);
    });
    this.on(this.favorite, 'click', () => this.action(this.favorite, item => adapter.favorite(session, item, signal)));
    this.on(adapter.userData, 'change', event => {
      if (event.detail.key !== session.key || signal.aborted) return;
      const item = this.items.find(item => item.Id === event.detail.id);
      if (item) { item.UserData = { ...item.UserData, ...event.detail.userData }; this.updateFavorite(); }
    });
    host.prepend(this.root);
    this.show(0);
    this.updateRotation();
  }

  on(target, event, callback) { target.addEventListener(event, callback, { signal: this.controller.signal }); }

  async action(control, task) {
    if (this.busy || this.signal.aborted) return;
    this.pause(); this.busy = true; control.disabled = true;
    control.setAttribute('aria-busy', 'true'); this.status.textContent = '';
    const item = this.items[this.index];
    try { await task(item); }
    catch (error) { if (error.name !== 'AbortError' && !this.signal.aborted) this.status.textContent = this.labels.error; }
    finally {
      this.busy = false; control.disabled = false; control.removeAttribute('aria-busy');
      if (!this.signal.aborted) this.updateFavorite();
    }
  }

  updateFavorite() {
    const active = Boolean(this.items[this.index].UserData?.IsFavorite);
    this.favorite.setAttribute('aria-pressed', String(active));
    this.favorite.setAttribute('aria-label', active ? this.labels.unfavorite : this.labels.favorite);
  }

  show(index) {
    if (this.busy || this.signal.aborted) return;
    this.index = (index + this.items.length) % this.items.length;
    const item = this.items[this.index];
    this.root.dataset.itemId = item.Id;
    this.heading.textContent = text(item.Name, 200);
    this.heading.classList.remove('jellytv-visually-hidden');
    this.logo.hidden = true;
    this.meta.textContent = metadata(item, this.language).join(' · ');
    this.description.textContent = text(item.Overview, 420);
    const amount = progress(item);
    this.bar.hidden = amount <= 0;
    this.bar.value = amount;
    const label = resumeTicks(item) > 0 && item.Type !== 'Series' ? this.labels.resume : this.labels.play;
    this.playLabel.textContent = label;
    this.play.setAttribute('aria-label', label);
    this.updateFavorite();
    this.status.textContent = '';
    this.dotButtons.forEach((dot, position) => {
      dot.setAttribute('aria-current', String(position === this.index));
      dot.tabIndex = position === this.index ? 0 : -1;
    });
    const generation = ++this.imageGeneration;
    const width = Math.min(3840, Math.ceil(this.root.clientWidth * Math.min(window.devicePixelRatio || 1, 2) / 320) * 320);
    const backdropUrl = this.adapter.image(this.session, item, 'Backdrop', width);
    this.root.classList.toggle('jellytv-hero--without-backdrop', !backdropUrl);
    const role = !backdropUrl && secondaryArtwork(item);
    this.secondary.hidden = true;
    if (role) {
      this.secondary.dataset.artworkRole = role;
      this.secondary.onload = () => { if (generation === this.imageGeneration && !this.signal.aborted) this.secondary.hidden = false; };
      this.secondary.onerror = () => { if (generation === this.imageGeneration) this.secondary.hidden = true; };
      this.secondary.src = this.adapter.image(this.session, item, role, 640);
    } else this.secondary.removeAttribute('src');
    const nextImage = this.images[generation % 2];
    const oldImage = this.images[(generation + 1) % 2];
    nextImage.classList.remove('is-visible');
    if (backdropUrl) {
      nextImage.onload = () => {
        if (generation !== this.imageGeneration || this.signal.aborted) return;
        nextImage.classList.add('is-visible'); oldImage.classList.remove('is-visible');
      };
      nextImage.onerror = () => { if (generation === this.imageGeneration) this.images.forEach(image => image.classList.remove('is-visible')); };
      nextImage.src = backdropUrl;
    } else this.images.forEach(image => image.classList.remove('is-visible'));
    const logoUrl = this.adapter.image(this.session, item, 'Logo', 640);
    if (logoUrl) {
      this.logo.onload = () => {
        if (generation !== this.imageGeneration || this.signal.aborted) return;
        this.logo.hidden = false; this.heading.classList.add('jellytv-visually-hidden');
      };
      this.logo.onerror = () => {
        if (generation !== this.imageGeneration || this.signal.aborted) return;
        this.logo.hidden = true; this.heading.classList.remove('jellytv-visually-hidden');
      };
      this.logo.src = logoUrl;
    } else this.logo.removeAttribute('src');
    this.schedule();
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.rotating || this.reduced.matches || this.signal.aborted || document.hidden || this.items.length < 2) return;
    this.timer = setTimeout(() => {
      if (!this.root.isConnected || this.root.closest('[hidden], .hide') || document.querySelector('.dialog.opened, .MuiDialog-root')) { this.pause(); return; }
      this.show(this.index + 1);
    }, this.interval);
  }

  updateRotation() {
    this.rotate.setAttribute('aria-label', this.rotating ? this.labels.pause : this.labels.rotate);
    this.rotate.textContent = this.rotating ? 'Ⅱ' : '▷';
    this.rotate.disabled = this.reduced.matches;
  }

  pause() { this.rotating = false; clearTimeout(this.timer); this.updateRotation(); }

  destroy() {
    this.pause(); this.controller.abort(); this.imageGeneration++;
    [...this.images, this.logo, this.secondary].forEach(image => { image.onload = null; image.onerror = null; image.removeAttribute('src'); });
    this.root.remove();
  }
}
