import { candidates, imageSpec, resumeTicks } from './model.mjs';

/** Only the active apiClient supplies authentication; nothing is persisted by JellyTV. */
export class JellyfinAdapter {
  constructor(deps) { this.deps = deps; this.userData = new EventTarget(); }

  session() {
    const client = this.deps.ServerConnections?.currentApiClient?.();
    const userId = client?.getCurrentUserId?.();
    if (!client || !userId || typeof client.getUrl !== 'function' || typeof client.accessToken !== 'function' || typeof client.serverId !== 'function') return null;
    return { client, userId, key: `${client.serverId()}:${userId}` };
  }

  async request(session, path, query = {}, { signal, method = 'GET' } = {}) {
    if (this.session()?.key !== session.key) throw new DOMException('Session changed', 'AbortError');
    // Reuse the authenticated client's identity: a different DeviceId creates a
    // different server session even when the bearer token belongs to this client.
    const identity = {
      Client: session.client.appName?.(), Device: session.client.deviceName?.(),
      DeviceId: session.client.deviceId?.(), Version: session.client.appVersion?.(),
      Token: session.client.accessToken()
    };
    if (Object.values(identity).some(value => typeof value !== 'string' || !value || /[\r\n"\\]/.test(value))) throw new Error('Invalid active session');
    const authorization = 'MediaBrowser ' + Object.entries(identity).map(([name, value]) => `${name}="${value}"`).join(', ');
    const url = session.client.getUrl(path, query);
    const response = await fetch(url, {
      method, signal, credentials: 'omit', cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: authorization }
    });
    if (!response.ok) throw new Error(`JellyTV request failed (${response.status})`);
    if (this.session()?.key !== session.key) throw new DOMException('Session changed', 'AbortError');
    return response.status === 204 ? null : response.json();
  }

  async featured(session, signal, limit) {
    const result = await this.request(session, 'Items', {
      userId: session.userId, includeItemTypes: 'Movie,Series', recursive: true,
      fields: 'Overview,Genres,Taglines,PrimaryImageAspectRatio', enableUserData: true,
      enableImages: true, imageTypeLimit: 1, enableImageTypes: 'Backdrop,Logo,Primary,Thumb,Art',
      sortBy: 'DateCreated', sortOrder: 'Descending', limit
    }, { signal });
    return candidates(result.Items, limit).map(item => ({ ...item, ServerId: session.client.serverId() }));
  }

  image(session, item, type, width) {
    const spec = imageSpec(item, type, width);
    return spec ? session.client.getScaledImageUrl(spec.id, spec.options) : '';
  }

  item(session, id, signal) {
    if (typeof id !== 'string' || !id || id.length > 128) throw new Error('Invalid item');
    return this.request(session, `Users/${encodeURIComponent(session.userId)}/Items/${encodeURIComponent(id)}`, {}, { signal });
  }

  async favorite(session, item, signal) {
    const isFavorite = !item.UserData?.IsFavorite;
    const data = await this.request(session, `UserFavoriteItems/${encodeURIComponent(item.Id)}`, { userId: session.userId }, { signal, method: isFavorite ? 'POST' : 'DELETE' });
    item.UserData = { ...item.UserData, ...data, IsFavorite: isFavorite };
    // Keep the optional surfaces coherent without writing to native card DOM.
    this.userData.dispatchEvent(new CustomEvent('change', {
      detail: { key: session.key, id: item.Id, userData: { ...item.UserData } }
    }));
    return isFavorite;
  }

  async play(session, item, signal) {
    let playable = item;
    if (item.Type === 'Series') {
      const next = await this.request(session, 'Shows/NextUp', { userId: session.userId, seriesId: item.Id, limit: 1, enableUserData: true }, { signal });
      playable = next.Items?.[0];
      if (!playable) {
        const episodes = await this.request(session, `Shows/${encodeURIComponent(item.Id)}/Episodes`, { userId: session.userId, limit: 1, isMissing: false, enableUserData: true }, { signal });
        playable = episodes.Items?.[0];
      }
      if (!playable) throw new Error('No playable episode');
    }
    if (signal.aborted || this.session()?.key !== session.key) throw new DOMException('Session changed', 'AbortError');
    return this.deps.playbackManager.play({ items: [{ ...playable, ServerId: session.client.serverId() }], startPositionTicks: resumeTicks(playable) });
  }

  details(session, item) {
    if (this.session()?.key === session.key) this.deps.appRouter.showItem({ ...item, ServerId: session.client.serverId() });
  }
}
