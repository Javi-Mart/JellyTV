/** Pure normalization: metadata is untrusted and never becomes markup. */
export function text(value, limit = 600) {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

export function progress(item) {
  const reported = finiteNumber(item?.UserData?.PlayedPercentage);
  if (reported !== null) return Math.max(0, Math.min(100, reported));
  const duration = finiteNumber(item?.RunTimeTicks);
  const position = finiteNumber(item?.UserData?.PlaybackPositionTicks);
  if (duration > 0 && position !== null) return Math.max(0, Math.min(100, position / duration * 100));
  return item?.UserData?.Played === true ? 100 : 0;
}

function finiteNumber(value) {
  return (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value)) ? Number(value) : null;
}

/** A watched percentage is not a playable resume position. */
export function resumeTicks(item) {
  const position = finiteNumber(item?.UserData?.PlaybackPositionTicks);
  const duration = finiteNumber(item?.RunTimeTicks);
  return position > 0 && !(duration > 0 && position >= duration) ? position : 0;
}

export function candidates(items, limit = 8) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter(item => {
    if (!item?.Id || !text(item.Name) || !['Movie', 'Series', 'Episode'].includes(item.Type) || seen.has(item.Id)) return false;
    seen.add(item.Id);
    return true;
  }).slice(0, Math.max(1, Math.min(12, limit)));
}

export function metadata(item, language = 'en') {
  const values = [];
  const labels = strings[language.toLowerCase().startsWith('es') ? 'es' : 'en'];
  if (item.Type === 'Movie') values.push(labels.movie);
  if (item.Type === 'Series') values.push(labels.show);
  if (item.Type === 'Episode') values.push(labels.episode);
  const year = Number.isInteger(item.ProductionYear) && item.ProductionYear > 0 ? item.ProductionYear : null;
  const end = item.Type === 'Series' && /^\d{4}-\d{2}-\d{2}/.test(item.EndDate || '') ? Number(item.EndDate.slice(0, 4)) : null;
  if (year) values.push(end > year ? `${year}–${end}` : String(year));
  const duration = finiteNumber(item.RunTimeTicks);
  if (item.Type !== 'Series' && duration > 0) values.push(`${Math.max(1, Math.round(duration / 600000000))} min`);
  if (text(item.OfficialRating, 30)) values.push(text(item.OfficialRating, 30));
  const rating = finiteNumber(item.CommunityRating);
  if (rating > 0 && rating <= 10) values.push(`★ ${rating.toLocaleString(language, { maximumFractionDigits: 1 })}/10`);
  const critic = finiteNumber(item.CriticRating);
  if (critic !== null && critic >= 0 && critic <= 100) values.push(`${labels.critics} ${Math.round(critic)}%`);
  if (item.Type === 'Series' && ['Continuing', 'Ended'].includes(item.Status)) values.push(item.Status === 'Ended' ? labels.ended : labels.continuing);
  values.push(...[...new Set((Array.isArray(item.Genres) ? item.Genres : []).map(genre => text(genre, 40)).filter(Boolean))].slice(0, 2));
  return values;
}

export function imageSpec(item, kind = 'Backdrop', width = 1920) {
  const limits = { Backdrop: 3840, Primary: 800, Logo: 640, Thumb: 1280, Art: 1280, Banner: 1920 };
  if (!item || !Object.hasOwn(limits, kind)) return null;
  const maxWidth = Math.round(Math.max(80, Math.min(limits[kind], finiteNumber(width) || limits[kind])));
  const descriptor = (id, tag, index) => typeof id === 'string' && id && typeof tag === 'string' && tag
    ? { id, options: { type: kind, ...(index === undefined ? {} : { index }), tag, maxWidth, quality: kind === 'Logo' || kind === 'Art' ? 90 : 85 } }
    : null;
  if (kind === 'Backdrop') return descriptor(item.Id, item.BackdropImageTags?.[0], 0) || descriptor(item.ParentBackdropItemId, item.ParentBackdropImageTags?.[0], 0);
  if (kind === 'Logo') return descriptor(item.Id, item.ImageTags?.Logo) || descriptor(item.ParentLogoItemId, item.ParentLogoImageTag);
  if (kind === 'Thumb') return descriptor(item.Id, item.ImageTags?.Thumb) || descriptor(item.ParentThumbItemId, item.ParentThumbImageTag);
  return descriptor(item.Id, item.ImageTags?.[kind]);
}

/** Secondary artwork stays in its own contained box; it never becomes backdrop. */
export function secondaryArtwork(item) {
  return ['Primary', 'Thumb', 'Art'].find(kind => imageSpec(item, kind)) || null;
}

export function homeRoute(hash) {
  if (typeof hash !== 'string') return false;
  if (['', '#/', '#'].includes(hash)) return true;
  const route = hash.replace(/^#?!?\/?/, '');
  const [path, query = ''] = route.split('?');
  if (!/^home(?:\.html)?\/?$/i.test(path)) return false;
  const tab = new URLSearchParams(query).get('tab');
  return tab === null || tab === '0';
}

export const strings = {
  en: { featured: 'Featured', play: 'Play', resume: 'Resume', info: 'More info', favorite: 'Add to favorites', unfavorite: 'Remove from favorites', previous: 'Previous title', next: 'Next title', pause: 'Pause rotation', rotate: 'Start rotation', error: 'This action could not be completed. Please try again.', loading: 'Loading featured titles', slide: 'Title', progress: 'Watched', show: 'Series', movie: 'Movie', episode: 'Episode', critics: 'Critics', ended: 'Ended', continuing: 'Continuing', retry: 'Try again', unavailable: 'Featured titles are temporarily unavailable.', close: 'Close preview', previewKeys: 'Alt + ↓ for actions · Esc to close' },
  es: { featured: 'Destacados', play: 'Reproducir', resume: 'Continuar', info: 'Más información', favorite: 'Añadir a favoritos', unfavorite: 'Quitar de favoritos', previous: 'Título anterior', next: 'Título siguiente', pause: 'Pausar rotación', rotate: 'Iniciar rotación', error: 'No se pudo completar la acción. Inténtalo de nuevo.', loading: 'Cargando títulos destacados', slide: 'Título', progress: 'Visto', show: 'Serie', movie: 'Película', episode: 'Episodio', critics: 'Crítica', ended: 'Finalizada', continuing: 'En emisión', retry: 'Reintentar', unavailable: 'Los destacados no están disponibles en este momento.', close: 'Cerrar vista previa', previewKeys: 'Alt + ↓ para las acciones · Esc para cerrar' }
};

export function locale() {
  const language = globalThis.document?.documentElement.lang || globalThis.navigator?.language || 'en';
  return { language, labels: strings[language.toLowerCase().startsWith('es') ? 'es' : 'en'] };
}
