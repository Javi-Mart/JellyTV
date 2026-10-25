import { locale, metadata, progress, resumeTicks, text } from './model.mjs';

const node = (tag, className, value) => {
  const result = document.createElement(tag);
  result.className = className;
  if (value !== undefined) result.textContent = value;
  return result;
};

/** One bounded portal for the current Home. No polling, global observer,
 * trailer playback or eager item requests. Native cards remain intact. */
export class CardPreview {
  constructor({ host, adapter, session, signal }) {
    Object.assign(this, { host, adapter, session, signal }, locale());
    this.listeners = new AbortController();
    this.cache = new Map();
    this.fine = matchMedia('(hover: hover) and (pointer: fine)');
    this.tv = document.documentElement.classList.contains('layout-tv');
    this.on(host, 'pointerover', event => {
      if (!this.tv && this.fine.matches && event.pointerType === 'mouse') this.consider(event.target, false);
    });
    this.on(host, 'pointerout', event => {
      if (!this.source || this.source.contains(event.relatedTarget) || this.root?.contains(event.relatedTarget)) return;
      this.deferClose();
    });
    this.on(host, 'focusin', event => { if (!this.restoringFocus) this.consider(event.target, true); });
    this.on(host, 'focusout', event => {
      if (!this.source?.contains(event.relatedTarget) && !this.root?.contains(event.relatedTarget)) this.deferClose();
    });
    this.on(host, 'keydown', event => {
      if (event.key === 'Escape') this.close();
      if (event.altKey && event.key === 'ArrowDown' && this.root && !this.tv && this.source?.contains(event.target)) {
        event.preventDefault(); this.root.querySelector('button')?.focus();
      }
    });
    this.on(window, 'scroll', event => {
      if (!(event.target instanceof Node) || !this.root?.contains(event.target)) this.close();
    }, { capture: true, passive: true });
    this.on(window, 'resize', () => this.close());
    this.on(document, 'visibilitychange', () => { if (document.hidden) this.close(); });
    this.on(adapter.userData, 'change', event => {
      if (event.detail.key !== session.key || signal.aborted) return;
      const item = this.cache.get(event.detail.id);
      if (item) item.UserData = { ...item.UserData, ...event.detail.userData };
      if (this.source?.dataset.id === event.detail.id && this.favorite) {
        const active = Boolean(event.detail.userData.IsFavorite);
        this.favorite.textContent = active ? this.labels.unfavorite : this.labels.favorite;
        this.favorite.setAttribute('aria-pressed', String(active));
      }
    });
    signal.addEventListener('abort', () => this.destroy(), { once: true, signal: this.listeners.signal });
  }

  on(target, type, callback, options = {}) {
    target.addEventListener(type, callback, { ...options, signal: this.listeners.signal });
  }

  onSurface(target, type, callback) { target.addEventListener(type, callback, { signal: this.surface.signal }); }

  consider(target, keyboard) {
    if (this.signal.aborted || (!this.tv && !this.fine.matches)) return;
    const card = target.closest('.card[data-id]');
    if (!card || !this.host.contains(card) || !['Movie', 'Series', 'Episode'].includes(card.dataset.type)) return;
    clearTimeout(this.closeTimer);
    if (card === this.source) return;
    this.close(); this.source = card; this.origin = keyboard ? target : null;
    this.timer = setTimeout(() => this.open(card), this.tv ? 650 : 300);
  }

  deferClose() {
    // Leaving before intent is established cancels the request immediately;
    // only an already open surface needs a grace period to cross the gap.
    if (!this.root) { this.close(); return; }
    clearTimeout(this.closeTimer); this.closeTimer = setTimeout(() => this.close(), 120);
  }

  async open(card) {
    if (!card.isConnected || card !== this.source || this.signal.aborted) return;
    const request = new AbortController(); this.request = request;
    const id = card.dataset.id;
    try {
      const item = this.cache.get(id) || await this.adapter.item(this.session, id, request.signal);
      if (request.signal.aborted || this.signal.aborted || card !== this.source || this.adapter.session()?.key !== this.session.key) return;
      this.cache.set(id, item);
      if (this.cache.size > 24) this.cache.delete(this.cache.keys().next().value);
      this.render(card, item);
    } catch (error) {
      if (error.name !== 'AbortError' && card === this.source) this.close();
    }
  }

  render(card, item) {
    this.surface = new AbortController();
    const root = node('aside', 'jellytv-preview');
    this.root = root;
    root.setAttribute('aria-label', text(item.Name));
    root.dataset.jellytv = 'preview';
    root.classList.toggle('jellytv-preview--tv', this.tv);
    const artwork = this.adapter.image(this.session, item, 'Thumb', 640) || this.adapter.image(this.session, item, 'Backdrop', 640);
    if (artwork && !this.tv) {
      const image = node('img', 'jellytv-preview__image'); image.alt = ''; image.src = artwork;
      image.onerror = () => image.remove(); root.append(image);
    }
    const body = node('div', 'jellytv-preview__body');
    body.append(node('h3', 'jellytv-preview__title', text(item.Name, 200)), node('p', 'jellytv-preview__meta', metadata(item, this.language).join(' · ')));
    if (item.Overview) body.append(node('p', 'jellytv-preview__overview', text(item.Overview, 250)));
    const amount = progress(item);
    if (amount > 0) {
      const bar = node('progress', 'jellytv-preview__progress'); bar.max = 100; bar.value = amount;
      bar.setAttribute('aria-label', this.labels.progress); body.append(bar);
    }
    if (!this.tv) {
      const actions = node('div', 'jellytv-preview__actions');
      const status = node('p', 'jellytv-hero__status'); status.setAttribute('role', 'status');
      const action = (label, callback, primary = false) => {
        const button = node('button', `jellytv-button${primary ? ' jellytv-button--primary' : ''}`, label);
        button.type = 'button';
        this.onSurface(button, 'click', async () => {
          if (this.busy || this.signal.aborted) return;
          this.busy = true; button.disabled = true; status.textContent = '';
          try { await callback(button); }
          catch (error) { if (error.name !== 'AbortError' && !this.signal.aborted) status.textContent = this.labels.error; }
          finally { this.busy = false; button.disabled = false; }
        });
        actions.append(button); return button;
      };
      action(resumeTicks(item) > 0 ? this.labels.resume : this.labels.play, () => this.adapter.play(this.session, item, this.signal), true);
      const favorite = action(item.UserData?.IsFavorite ? this.labels.unfavorite : this.labels.favorite, async button => {
        const active = await this.adapter.favorite(this.session, item, this.signal);
        button.textContent = active ? this.labels.unfavorite : this.labels.favorite;
        button.setAttribute('aria-pressed', String(active));
      });
      favorite.setAttribute('aria-pressed', String(Boolean(item.UserData?.IsFavorite)));
      this.favorite = favorite;
      action(this.labels.info, () => this.adapter.details(this.session, item));
      body.append(actions, status);
      if (this.origin) {
        const hint = node('p', 'jellytv-preview__hint', this.labels.previewKeys);
        hint.id = 'jellytv-preview-keyboard-hint'; body.append(hint);
        this.originAttributes = ['aria-keyshortcuts', 'aria-describedby'].map(name => [name, this.origin.getAttribute(name)]);
        this.origin.setAttribute('aria-keyshortcuts', [this.origin.getAttribute('aria-keyshortcuts'), 'Alt+ArrowDown'].filter(Boolean).join(' '));
        this.origin.setAttribute('aria-describedby', [this.origin.getAttribute('aria-describedby'), hint.id].filter(Boolean).join(' '));
      }
      this.onSurface(root, 'pointerenter', () => clearTimeout(this.closeTimer));
      this.onSurface(root, 'pointerleave', event => { if (!card.contains(event.relatedTarget)) this.deferClose(); });
      this.onSurface(root, 'focusin', () => clearTimeout(this.closeTimer));
      this.onSurface(root, 'focusout', event => { if (!root.contains(event.relatedTarget) && !card.contains(event.relatedTarget)) this.deferClose(); });
      this.onSurface(root, 'keydown', event => {
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation(); const origin = this.origin; this.close();
          this.restoringFocus = true;
          try { origin?.focus({ preventScroll: true }); } finally { this.restoringFocus = false; }
        }
      });
    }
    root.append(body); document.body.append(root);
    const rect = card.getBoundingClientRect();
    const available = Math.max(0, innerWidth - 32);
    root.style.width = `${Math.min(this.tv ? 620 : 420, available)}px`;
    const size = root.getBoundingClientRect();
    const right = rect.right + 12;
    const left = right + size.width <= innerWidth - 16 ? right : Math.max(16, Math.min(rect.left, innerWidth - size.width - 16));
    root.style.left = `${left}px`;
    root.style.top = `${Math.max(16, Math.min(rect.top, innerHeight - size.height - 16))}px`;
  }

  close() {
    clearTimeout(this.timer); clearTimeout(this.closeTimer);
    this.request?.abort(); this.request = null;
    this.surface?.abort(); this.surface = null;
    if (this.origin?.isConnected) for (const [name, value] of this.originAttributes || []) {
      if (value === null) this.origin.removeAttribute(name); else this.origin.setAttribute(name, value);
    }
    this.originAttributes = null; this.favorite = null;
    this.root?.remove(); this.root = null; this.source = null; this.origin = null;
  }

  destroy() { this.close(); this.listeners.abort(); this.cache.clear(); }
}
