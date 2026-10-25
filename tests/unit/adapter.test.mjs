import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { JellyfinAdapter } from '../../enhanced/adapter.mjs';

function setup() {
  let user = 'viewer';
  const client = { getCurrentUserId: () => user, serverId: () => 'server', accessToken: () => 'test-session', appName: () => 'Jellyfin%20Web', deviceName: () => 'Firefox', deviceId: () => 'active-device', appVersion: () => '12.2.0', getUrl: (path, query) => `http://localhost/${path}?${new URLSearchParams(query)}`, getScaledImageUrl: () => 'http://localhost/image' };
  const calls = [];
  const adapter = new JellyfinAdapter({ ServerConnections: { currentApiClient: () => client }, playbackManager: { play: options => calls.push(options) }, appRouter: { showItem: item => calls.push(item) } });
  return { adapter, client, session: adapter.session(), calls, changeUser: () => { user = 'another'; } };
}

test('featured request is bounded and uses active-session authorization, not URL token', async () => {
  const { adapter, session } = setup();
  const fetch = mock.method(globalThis, 'fetch', async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('limit'), '8');
    assert.equal(parsed.searchParams.get('userId'), 'viewer');
    assert.equal(url.includes('test-session'), false);
    assert.equal(options.headers.Authorization, 'MediaBrowser Client="Jellyfin%20Web", Device="Firefox", DeviceId="active-device", Version="12.2.0", Token="test-session"');
    return Response.json({ Items: [{ Id: 'a', Name: 'Film', Type: 'Movie' }] });
  });
  try { assert.equal((await adapter.featured(session, new AbortController().signal, 8))[0].ServerId, 'server'); }
  finally { fetch.mock.restore(); }
});
test('invalid or missing session identity never dispatches an authenticated request', async () => {
  const { adapter, client, session } = setup();
  const fetch = mock.method(globalThis, 'fetch', async () => { throw new Error('Must not fetch'); });
  try {
    for (const value of [undefined, '', 'bad\r\nheader', 'bad"value', 'bad\\value']) {
      client.deviceId = () => value;
      await assert.rejects(adapter.featured(session, new AbortController().signal, 8), /Invalid active session/);
    }
    assert.equal(fetch.mock.callCount(), 0);
  } finally { fetch.mock.restore(); }
});
test('results from a previous user are rejected before painting', async () => {
  const { adapter, session, changeUser } = setup();
  const fetch = mock.method(globalThis, 'fetch', async () => { changeUser(); return Response.json({ Items: [] }); });
  try { await assert.rejects(adapter.featured(session, new AbortController().signal, 8), { name: 'AbortError' }); }
  finally { fetch.mock.restore(); }
});
test('failed favorite update does not change local favorite state', async () => {
  const { adapter, session } = setup();
  const item = { Id: 'a', UserData: { IsFavorite: false } };
  const fetch = mock.method(globalThis, 'fetch', async () => new Response('', { status: 403 }));
  try { await assert.rejects(adapter.favorite(session, item, new AbortController().signal)); assert.equal(item.UserData.IsFavorite, false); }
  finally { fetch.mock.restore(); }
});

test('confirmed favorites notify other surfaces only after a successful response for the active user', async () => {
  const { adapter, session, changeUser } = setup();
  const item = { Id: 'a', UserData: { IsFavorite: false, PlaybackPositionTicks: 100 } };
  const notifications = [];
  adapter.userData.addEventListener('change', event => notifications.push(event.detail));
  let response = () => Response.json({ IsFavorite: true });
  const fetch = mock.method(globalThis, 'fetch', async () => response());
  try {
    await adapter.favorite(session, item, new AbortController().signal);
    assert.deepEqual(notifications, [{ key: session.key, id: 'a', userData: { IsFavorite: true, PlaybackPositionTicks: 100 } }]);
    response = () => new Response('', { status: 403 });
    await assert.rejects(adapter.favorite(session, item, new AbortController().signal));
    assert.equal(notifications.length, 1);
    response = () => { changeUser(); return Response.json({ IsFavorite: false }); };
    await assert.rejects(adapter.favorite(session, item, new AbortController().signal), { name: 'AbortError' });
    assert.equal(notifications.length, 1);
  } finally { fetch.mock.restore(); }
});
test('resume delegates to Jellyfin playback and preserves ticks', async () => {
  const { adapter, session, calls } = setup();
  await adapter.play(session, { Id: 'film', Type: 'Movie', UserData: { PlaybackPositionTicks: 12345 } }, new AbortController().signal);
  assert.equal(calls[0].startPositionTicks, 12345);
  assert.equal(calls[0].items[0].ServerId, 'server');
});
test('series resolves next up; an empty series cannot launch a dead Play action', async () => {
  const { adapter, session, calls } = setup();
  let next = { Items: [{ Id: 'episode', Type: 'Episode' }] };
  const fetch = mock.method(globalThis, 'fetch', async () => Response.json(next));
  try {
    await adapter.play(session, { Id: 'series', Type: 'Series' }, new AbortController().signal);
    assert.equal(calls[0].items[0].Id, 'episode');
    next = { Items: [] };
    await assert.rejects(adapter.play(session, { Id: 'empty', Type: 'Series' }, new AbortController().signal), /No playable episode/);
    assert.equal(calls.length, 1);
  } finally { fetch.mock.restore(); }
});
test('pre-aborted actions never dispatch playback', async () => {
  const { adapter, session, calls } = setup();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(adapter.play(session, { Id: 'film', Type: 'Movie' }, controller.signal), { name: 'AbortError' });
  assert.equal(calls.length, 0);
});
