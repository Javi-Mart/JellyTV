const paths = {
  play: 'M8 5v14l11-7z',
  info: 'M12 8h.01M12 11v6M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  left: 'm15 5-7 7 7 7', right: 'm9 5 7 7-7 7'
};

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (name === 'heart') svg.classList.add('jellytv-heart');
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

export function timing(style, duration, easing) {
  return { duration: Number.parseFloat(style.getPropertyValue(duration)) || 0, easing: style.getPropertyValue(easing).trim() || 'linear' };
}

const feedback = new WeakMap();

export function favoriteState(button, active, labels, animate = false) {
  const pressed = String(active);
  const previous = button.getAttribute('aria-pressed');
  if (previous === pressed) return;
  const label = active ? labels.unfavorite : labels.favorite;
  button.setAttribute('aria-pressed', pressed);
  button.setAttribute('aria-label', label);
  const caption = button.querySelector('span');
  if (caption) caption.textContent = label;
  feedback.get(button)?.cancel();
  const heart = button.querySelector('.jellytv-heart');
  if (!animate || previous === null || !heart?.animate) return;
  const motion = timing(getComputedStyle(button), '--motion-select', '--ease-tactile');
  if (motion.duration) feedback.set(button, heart.animate([
    { transform: 'scale(0.92)' }, { transform: active ? 'scale(1.12)' : 'scale(0.97)', offset: 0.52 }, { transform: 'scale(1)' }
  ], motion));
}
