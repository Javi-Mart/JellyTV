import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidates, homeRoute, imageSpec, metadata, progress, resumeTicks, secondaryArtwork, text } from '../../enhanced/model.mjs';

test('untrusted metadata stays bounded plain text, never markup', () => {
  assert.equal(text('<img src=x onerror=alert(1)>Hello   world'), 'Hello world');
  assert.equal(text(null), '');
  assert.equal(text('long title', 4), 'long');
});
test('progress handles missing, corrupt, negative and completed ticks', () => {
  assert.equal(progress({ RunTimeTicks: 200, UserData: { PlaybackPositionTicks: 50 } }), 25);
  for (const item of [{}, { RunTimeTicks: 0 }, { RunTimeTicks: -1 }, { RunTimeTicks: 100, UserData: { PlaybackPositionTicks: Infinity } }]) assert.equal(progress(item), 0);
  assert.equal(progress({ RunTimeTicks: 100, UserData: { PlaybackPositionTicks: 150 } }), 100);
  assert.equal(progress({ RunTimeTicks: 100, UserData: { PlaybackPositionTicks: -2 } }), 0);
});
test('candidate selection deduplicates IDs, excludes folders and limits a response', () => {
  const movie = { Id: 'a', Name: 'A', Type: 'Movie' };
  assert.deepEqual(candidates([movie, movie, null, { Id: 'x', Name: 'Folder', Type: 'BoxSet' }]), [movie]);
  assert.equal(candidates(Array.from({ length: 40 }, (_, i) => ({ ...movie, Id: String(i) })), 500).length, 12);
  assert.deepEqual(candidates(null), []);
});
test('image fallbacks keep parent ID/tag paired and omit unavailable logos', () => {
  assert.equal(imageSpec({ Id: 'episode' }, 'Logo'), null);
  assert.equal(imageSpec({ Id: 'episode' }), null);
  assert.deepEqual(imageSpec({ Id: 'episode', ParentBackdropItemId: 'show', ParentBackdropImageTags: ['tag'] }, 'Backdrop', 960), { id: 'show', options: { type: 'Backdrop', index: 0, tag: 'tag', maxWidth: 960, quality: 85 } });
});
test('metadata omits absent or invalid ratings and limits genres', () => {
  assert.deepEqual(metadata({ CommunityRating: 44, Genres: ['A', 'B', 'C'] }), ['A', 'B']);
  assert.deepEqual(metadata({ ProductionYear: 2026, OfficialRating: 'PG', CommunityRating: 8.4 }), ['2026', 'PG', '★ 8.4/10']);
});
test('route matcher does not mount on detail, dashboard or lookalike routes', () => {
  for (const hash of ['#/home', '#!/home', '#/home?tab=0', '#/', '#/home.html', '#!/home.html?tab=0']) assert.equal(homeRoute(hash), true, hash);
  for (const hash of ['#/homevideos', '#/details?id=a', '#/dashboard', '#/login', '#/home.html?tab=1', '#/home?tab=1']) assert.equal(homeRoute(hash), false, hash);
});

test('artwork roles are exhaustive, bounded and never silently changed to backdrop', () => {
  const item = { Id: 'item', BackdropImageTags: ['back'], ImageTags: { Primary: 'poster', Logo: 'logo', Thumb: 'thumb', Art: 'art', Banner: 'banner' } };
  for (const role of ['Backdrop', 'Primary', 'Logo', 'Thumb', 'Art', 'Banner']) {
    const spec = imageSpec(item, role, 999999);
    assert.equal(spec.id, 'item');
    assert.equal(spec.options.type, role);
    assert.ok(spec.options.maxWidth <= 3840);
    assert.equal(spec.options.tag, role === 'Backdrop' ? 'back' : item.ImageTags[role]);
  }
  assert.equal(imageSpec(item, 'ClearLogo'), null);
  assert.equal(imageSpec({ Id: 'item', ImageTags: { Primary: 'poster' } }, 'Backdrop'), null);
  assert.equal(secondaryArtwork({ Id: 'item', ImageTags: { Primary: 'poster', Thumb: 'thumb' } }), 'Primary');
  assert.equal(secondaryArtwork({ Id: 'item', ImageTags: { Art: 'art' } }), 'Art');
  assert.equal(imageSpec({ Id: 'child', ParentLogoItemId: 'parent', ParentLogoImageTag: 'tag' }, 'Logo').id, 'parent');
  assert.equal(imageSpec({ Id: 'child', ParentLogoImageTag: 'tag' }, 'Logo'), null);
});

test('watched state and resume position remain different concepts', () => {
  assert.equal(progress({ UserData: { PlayedPercentage: 42 } }), 42);
  assert.equal(resumeTicks({ UserData: { PlayedPercentage: 42 } }), 0);
  assert.equal(progress({ UserData: { Played: true } }), 100);
  assert.equal(resumeTicks({ RunTimeTicks: 100, UserData: { PlaybackPositionTicks: 100 } }), 0);
  assert.equal(resumeTicks({ RunTimeTicks: 100, UserData: { PlaybackPositionTicks: 25 } }), 25);
  assert.equal(progress({ RunTimeTicks: 100, UserData: { PlayedPercentage: null, PlaybackPositionTicks: 30 } }), 30);
});

test('metadata formats real duration, series status and explicit rating scales', () => {
  assert.deepEqual(metadata({ Type: 'Movie', RunTimeTicks: 900000000, CriticRating: 0 }, 'es'), ['Película', '2 min', 'Crítica 0%']);
  assert.deepEqual(metadata({ Type: 'Series', ProductionYear: 2020, EndDate: '2024-01-01', Status: 'Ended' }, 'es'), ['Serie', '2020–2024', 'Finalizada']);
  assert.deepEqual(metadata({ RunTimeTicks: null, CommunityRating: 'invalid', CriticRating: -1, Genres: ['Drama', 'Drama', 'Mystery'] }), ['Drama', 'Mystery']);
});
