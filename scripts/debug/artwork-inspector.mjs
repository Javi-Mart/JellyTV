/** Development-only DOM inspector. Not imported by the production build.
 * The output deliberately omits URLs, item IDs, metadata and authentication. */
export function inspectArtwork(doc = document) {
  const roles = ['Primary', 'Backdrop', 'Logo', 'Thumb', 'Art', 'Banner'];
  const selectors = [
    '#itemDetailPage:not(.hide) .detailLogo',
    '#itemDetailPage:not(.hide) .detailImageContainer .cardImageContainer',
    '#itemDetailPage:not(.hide) .itemBackdrop', '.backdropImage',
    '.jellytv-hero__backdrop', '.jellytv-hero__logo', '.jellytv-hero__secondary', '.jellytv-preview__image'
  ];
  const rect = node => {
    const box = node.getBoundingClientRect();
    return Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Math.round(box[key] * 100) / 100]));
  };
  const safeClass = node => [node.tagName.toLowerCase(), ...[...node.classList]
    .filter(value => /^(?:jellytv-|detail|card|itemBackdrop|backdropImage)/.test(value) && /^[a-z-]+$/i.test(value)).slice(0, 4)].join('.');
  return selectors.flatMap(selector => [...doc.querySelectorAll(selector)].map(node => {
    const style = doc.defaultView.getComputedStyle(node), dimensions = rect(node);
    const source = node.getAttribute('src') || style.backgroundImage;
    const type = source.match(/\/Images\/(Primary|Backdrop|Logo|Thumb|Art|Banner)(?:\/|[?"')]|$)/i)?.[1];
    const role = roles.find(value => value.toLowerCase() === type?.toLowerCase())
      || (node.classList.contains('detailLogo') || node.classList.contains('jellytv-hero__logo') ? 'Logo' : null)
      || (node.classList.contains('backdropImage') || node.classList.contains('itemBackdrop') || node.classList.contains('jellytv-hero__backdrop') ? 'Backdrop' : null)
      || (roles.includes(node.dataset.artworkRole) ? node.dataset.artworkRole : 'Unknown');
    return {
      role, selector, element: safeClass(node),
      component: node.closest('.jellytv-hero') ? 'Hero' : node.closest('.jellytv-preview') ? 'Preview' : node.closest('#itemDetailPage') ? 'Detail' : 'Shared backdrop',
      dimensions, aspectRatio: dimensions.height ? Math.round(dimensions.width / dimensions.height * 1000) / 1000 : null,
      container: node.parentElement ? { element: safeClass(node.parentElement), dimensions: rect(node.parentElement) } : null,
      visible: dimensions.width > 0 && dimensions.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0',
      position: style.position, objectFit: style.objectFit, backgroundSize: style.backgroundSize
    };
  }));
}

export function showArtworkInspector(doc = document) {
  doc.getElementById('jellytv-artwork-debug')?.remove();
  const panel = doc.createElement('aside'); panel.id = 'jellytv-artwork-debug';
  panel.setAttribute('aria-label', 'Artwork inspector — development');
  Object.assign(panel.style, { position: 'fixed', zIndex: '2147483647', inset: 'auto 16px 16px auto',
    width: 'min(640px, calc(100vw - 32px))', maxHeight: '60vh', overflow: 'auto',
    background: '#111820', color: '#fff', border: '2px solid #c5e7ff', padding: '16px', boxSizing: 'border-box' });
  const close = doc.createElement('button'); close.type = 'button'; close.textContent = 'Close inspector';
  close.style.minHeight = '44px'; close.addEventListener('click', () => panel.remove(), { once: true });
  const content = doc.createElement('pre'); content.style.whiteSpace = 'pre-wrap';
  content.textContent = JSON.stringify(inspectArtwork(doc), null, 2);
  panel.append(close, content); doc.body.append(panel);
  return { element: panel, close: () => panel.remove() };
}
