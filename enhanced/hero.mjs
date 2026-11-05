import { locale, metadata, progress, resumeTicks, secondaryArtwork, text } from './model.mjs';
import { favoriteState, icon, timing } from './controls.mjs';
import { ambientPalette } from './ambient.mjs';

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

/** Owns only its root, listeners, timer and requests. Never modifies Jellyfin overlays. */
export class Hero {
  constructor({ host, items, adapter, session, signal, interval = 10000 }) {
    Object.assign(this, { host, items, adapter, session, signal, interval });
    Object.assign(this, locale());
    this.index = 0;
    this.rotating = false;
    this.imageGeneration = 0;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.ambientAvailable = window.matchMedia('(forced-colors: none)');
    this.palettes = new Map();
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
    this.glows = this.images.map(() => element('div', 'jellytv-hero__ambient'));
    this.root.append(...this.glows, this.art, element('div', 'jellytv-hero__shade'));
    this.secondary = element('img', 'jellytv-hero__secondary');
    this.secondary.alt = ''; this.secondary.hidden = true;
    this.root.append(this.secondary);
    this.body = element('div', 'jellytv-hero__body');
    this.kicker = element('p', 'jellytv-hero__eyebrow', this.labels.featured);
    this.logo = element('img', 'jellytv-hero__logo');
    this.logo.alt = ''; this.logo.hidden = true;
    this.heading = element('h2', 'jellytv-hero__title');
    this.identity = element('div', 'jellytv-hero__identity');
    this.identity.append(this.kicker, this.logo, this.heading);
    this.meta = element('p', 'jellytv-hero__meta');
    this.description = element('p', 'jellytv-hero__description');
    this.actions = element('div', 'jellytv-hero__actions focuscontainer-x');
    this.play = button(this.labels.play, '', 'jellytv-button--primary');
    this.playLabel = element('span', '', this.labels.play);
    this.play.append(icon('play'), this.playLabel);
    this.info = button(this.labels.info, '', 'jellytv-button--secondary');
    this.info.append(icon('info'), element('span', '', this.labels.info));
    this.favorite = button(this.labels.favorite, '', 'jellytv-button--icon jellytv-button--favorite');
    this.favorite.append(icon('heart'));
    this.actions.append(this.play, this.info, this.favorite);
    for (const [key, node] of Object.entries({ play: this.play, info: this.info, favorite: this.favorite })) node.dataset.focusKey = key;
    this.bar = element('progress', 'jellytv-hero__progress');
    this.bar.max = 100;
    this.bar.setAttribute('aria-label', this.labels.progress);
    this.status = element('p', 'jellytv-hero__status');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.copy = element('div', 'jellytv-hero__copy');
    this.copy.append(this.identity, this.meta, this.description);
    this.body.append(this.copy, this.actions, this.bar, this.status);
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
    this.on(this.previous, 'click', () => { this.pause(); this.show(this.selection - 1); });
    this.on(this.next, 'click', () => { this.pause(); this.show(this.selection + 1); });
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
    this.on(this.reduced, 'change', () => {
      if (this.reduced.matches) {
        this.pause();
        this.transition?.commit();
        this.finishTransition();
      }
      this.updateRotation();
    });
    this.on(this.ambientAvailable, 'change', () => this.paintGlow(this.activeBackdrop));
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
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) this.show(this.selection + (dx < 0 ? 1 : -1));
    });
    this.on(this.root, 'pointercancel', () => { this.touch = null; });
    this.on(this.root, 'keydown', event => {
      // TV inputManager owns directional navigation. Desktop dots support arrow selection.
      if (document.documentElement.classList.contains('layout-tv') || !this.dots.contains(event.target)) return;
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); this.pause();
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : this.selection + (event.key === 'ArrowLeft' ? -1 : 1);
        this.show(index); this.dotButtons[this.selection].focus();
      }
    });
    this.on(this.play, 'click', () => this.action(this.play, item => adapter.play(session, item, signal)));
    this.on(this.info, 'click', () => {
      this.pause();
      if (this.selection !== this.index) this.show(this.index);
      // The router removes focus before viewshow is emitted. Remember the action now.
      this.navigationIntent = 'info';
      adapter.details(session, this.items[this.index]);
    });
    this.on(this.favorite, 'click', () => this.action(this.favorite, item => adapter.favorite(session, item, signal)));
    this.on(adapter.userData, 'change', event => {
      if (event.detail.key !== session.key || signal.aborted) return;
      const item = this.items.find(item => item.Id === event.detail.id);
      if (item) { item.UserData = { ...item.UserData, ...event.detail.userData }; this.updateFavorite(true); }
    });
    host.prepend(this.root);
    this.show(0);
    this.updateRotation();
  }

  on(target, event, callback) { target.addEventListener(event, callback, { signal: this.controller.signal }); }

  async action(control, task) {
    if (this.busy || this.signal.aborted) return;
    this.pause();
    if (this.selection !== this.index) this.show(this.index);
    this.busy = true; control.disabled = true;
    control.setAttribute('aria-busy', 'true'); this.status.textContent = '';
    const item = this.items[this.index];
    try { await task(item); }
    catch (error) { if (error.name !== 'AbortError' && !this.signal.aborted) this.status.textContent = this.labels.error; }
    finally {
      this.busy = false; control.disabled = false; control.removeAttribute('aria-busy');
      if (!this.signal.aborted) this.updateFavorite();
    }
  }

  updateFavorite(animate = false) {
    favoriteState(this.favorite, Boolean(this.items[this.index].UserData?.IsFavorite), this.labels, animate);
  }

  show(index) {
    if (this.busy || this.signal.aborted) return;
    const next = (index + this.items.length) % this.items.length;
    if (next === this.selection) return;
    this.finishTransition();
    this.dotButtons[this.selection]?.removeAttribute('data-pending');
    this.selection = next;
    const generation = ++this.imageGeneration;
    const staged = this.images.find(image => image !== this.activeBackdrop);
    staged.onload = null;
    staged.onerror = null;
    if (!this.root.dataset.itemId) this.renderItem(next);
    if (next === this.artworkIndex) {
      if (!staged.complete) staged.removeAttribute('src');
      this.schedule();
      return;
    }
    const item = this.items[next];
    const width = Math.min(3840, Math.ceil(this.root.clientWidth * Math.min(window.devicePixelRatio || 1, 2) / 320) * 320);
    const url = this.adapter.image(this.session, item, 'Backdrop', width);
    const commit = image => {
      if (generation !== this.imageGeneration || this.signal.aborted) return;
      staged.onload = null;
      staged.onerror = null;
      this.paintGlow(image);
      this.changeArtwork(next, image);
    };
    if (!url) {
      if (!staged.complete) staged.removeAttribute('src');
      commit(null);
      return;
    }
    this.dotButtons[next].setAttribute('data-pending', '');
    staged.onload = () => {
      if (staged.getAttribute('src') === url && staged.complete && staged.naturalWidth) commit(staged);
    };
    staged.onerror = () => { if (staged.getAttribute('src') === url) commit(null); };
    if (staged.getAttribute('src') !== url) staged.src = url;
    else if (staged.complete) commit(staged.naturalWidth ? staged : null);
    this.schedule();
  }

  renderItem(index) {
    this.index = index;
    const item = this.items[index];
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
      dot.setAttribute('aria-current', String(position === index));
      dot.tabIndex = position === index ? 0 : -1;
    });
    const logoUrl = this.adapter.image(this.session, item, 'Logo', 640);
    const current = () => this.index === index && !this.signal.aborted;
    if (logoUrl) {
      this.logo.onload = () => {
        if (!current() || !this.logo.complete || !this.logo.naturalWidth) return;
        this.logo.hidden = false; this.heading.classList.add('jellytv-visually-hidden');
      };
      this.logo.onerror = () => {
        if (!current()) return;
        this.logo.hidden = true; this.heading.classList.remove('jellytv-visually-hidden');
      };
      this.logo.src = logoUrl;
    } else this.logo.removeAttribute('src');
  }

  glow(image) { return this.glows[this.images.indexOf(image)]; }

  paintGlow(image) {
    if (!image || !this.ambientAvailable.matches) return;
    const url = image.currentSrc || image.src;
    if (!this.palettes.has(url)) {
      if (this.palettes.size === this.items.length) this.palettes.delete(this.palettes.keys().next().value);
      this.palettes.set(url, ambientPalette(image));
    }
    const [left = 'transparent', right = 'transparent', bottom = 'transparent'] = this.palettes.get(url);
    const glow = this.glow(image);
    glow.style.setProperty('--ambient-left', left);
    glow.style.setProperty('--ambient-right', right);
    glow.style.setProperty('--ambient-bottom', bottom);
  }

  finishTransition() {
    const transition = this.transition;
    if (!transition) return;
    this.transition = null;
    transition.animations.forEach(animation => animation.cancel());
    this.images.forEach(image => image.classList.remove('is-incoming', 'is-outgoing'));
  }

  changeArtwork(index, image) {
    const previous = this.activeBackdrop;
    const style = getComputedStyle(this.root);
    const blend = timing(style, '--motion-crossfade', '--ease-blend');
    const exit = timing(style, '--motion-handoff', '--ease-exit');
    const enter = timing(style, '--motion-normal', '--ease-enter');
    const commit = () => {
      if (this.artworkIndex === index) return;
      this.dotButtons[index].removeAttribute('data-pending');
      if (this.index !== index) this.renderItem(index);
      this.renderArtwork(index, image);
      this.schedule();
    };
    if (this.artworkIndex === undefined || this.reduced.matches || !blend.duration || !this.root.animate || (!previous && !image)) {
      commit();
      return;
    }

    // Source-over blend: keep the old photo opaque behind the incoming layer.
    // The foreground and its actions switch at the point of equal contribution.
    const animations = [];
    const transition = { animations, commit };
    this.transition = transition;
    const fade = (target, from, to, motion) => {
      if (!target) return;
      const animation = target.animate([{ opacity: from }, { opacity: to }], { ...motion, fill: 'both' });
      animations.push(animation);
      return animation;
    };
    previous?.classList.add('is-outgoing');
    image?.classList.add('is-incoming');
    const art = image ? fade(image, 0, 1, blend) : fade(previous, 1, 0, blend);
    if (this.ambientAvailable.matches) {
      fade(this.glow(previous), 1, 0, blend);
      fade(this.glow(image), 0, 1, blend);
    }
    const handoff = fade(this.copy, 1, 0, { ...exit, delay: blend.duration / 2 - exit.duration });
    handoff.onfinish = () => {
      if (this.transition !== transition || this.signal.aborted) return;
      commit();
      handoff.cancel();
      fade(this.copy, 0, 1, enter);
    };
    art.onfinish = () => {
      if (this.transition !== transition || this.signal.aborted) return;
      if (this.artworkIndex !== index) commit();
      this.finishTransition();
    };
  }

  renderArtwork(index, image) {
    this.artworkIndex = index;
    this.activeBackdrop = image;
    this.images.forEach((backdrop, position) => {
      backdrop.classList.toggle('is-visible', backdrop === image);
      this.glows[position].classList.toggle('is-visible', backdrop === image);
    });
    this.root.classList.toggle('jellytv-hero--without-backdrop', !image);
    const item = this.items[index];
    const role = !image && secondaryArtwork(item);
    this.secondary.hidden = true;
    if (role) {
      this.secondary.dataset.artworkRole = role;
      this.secondary.onload = () => {
        if (this.index === index && !this.signal.aborted && this.secondary.complete && this.secondary.naturalWidth) this.secondary.hidden = false;
      };
      this.secondary.onerror = () => { this.secondary.hidden = true; };
      this.secondary.src = this.adapter.image(this.session, item, role, 640);
    } else this.secondary.removeAttribute('src');
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.rotating || this.reduced.matches || this.signal.aborted || document.hidden || this.items.length < 2) return;
    this.timer = setTimeout(() => {
      if (!this.root.isConnected || this.root.closest('[hidden], .hide') || document.querySelector('.dialog.opened, .MuiDialog-root')) { this.pause(); return; }
      this.show(this.selection + 1);
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
    this.finishTransition();
    this.palettes.clear();
    [...this.images, this.logo, this.secondary].forEach(image => { image.onload = null; image.onerror = null; image.removeAttribute('src'); });
    this.root.remove();
  }
}
