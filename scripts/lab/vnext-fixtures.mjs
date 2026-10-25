import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

// This script only extends the disposable 10.10.6 lab. Its output never contains
// credentials, physical media paths or production identifiers.
const lab = resolve('.lab/vnext-10.10.6');
const credentials = JSON.parse(await readFile(join(lab, 'credentials.local.json'), 'utf8'));
assert.equal(credentials.baseURL, 'http://127.0.0.1:18997');
const authorization = `MediaBrowser Client="JellyTV Fixtures", Device="Isolated lab", DeviceId="jellytv-vnext-fixtures", Version="1.1.0", Token="${credentials.admin.accessToken}"`;
async function api(path, method = 'GET', body) {
  const response = await fetch(credentials.baseURL + path, {
    method, headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  assert.ok(response.ok, `${method} ${path.split('?')[0]} returned ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}
const info = await api('/System/Info/Public');
assert.equal(info.Version, '10.10.6');
assert.equal(info.Id, credentials.serverId, 'Refusing an unknown lab server');
const moviesRoot = join(lab, 'media/Movies');
const source = join(moviesRoot, 'The Quiet Horizon (2026)');
const sourceVideo = join(source, 'The Quiet Horizon.mp4');
await stat(sourceVideo);
const longTitle = 'The Journey Beyond the Last Constellation: A Chronicle of Every Uncharted Horizon, the People Who Crossed It, and the Extraordinary Silence That Followed';
const definitions = [
  { key: 'A', name: 'JellyTV A — Complete Artwork', description: 'Logo, backdrop, poster, ratings and genres' },
  { key: 'B', name: 'JellyTV B — Without Logo', omit: 'logo', description: 'Title fallback without logo' },
  { key: 'C', name: 'JellyTV C — Without Backdrop', omit: 'backdrop', description: 'Poster retained without background artwork' },
  { key: 'D', name: 'JellyTV D — Without Poster', omit: 'poster', description: 'Background and title without Primary' },
  { key: 'E', name: 'JellyTV E — Without Overview', omit: 'overview', description: 'Metadata and actions without synopsis' },
  { key: 'F', name: longTitle, description: 'Long title wraps without clipping or moving actions outside the page' },
  { key: 'G', name: 'JellyTV G — Many Genres', description: 'Twelve available genres', genres: ['Adventure', 'Science Fiction', 'Drama', 'Mystery', 'Thriller', 'Fantasy', 'History', 'Family', 'Animation', 'Documentary', 'Music', 'Comedy'] },
  { key: 'H', name: 'JellyTV H — UHD HDR Signal', description: 'Original 3840×2160 HEVC Main 10 PQ BT.2020 technical fixture', hdr: true }
];
const xml = text => text.replace(/[<>&"']/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]);
for (const definition of definitions) {
  const directory = join(moviesRoot, `JellyTV Fixture ${definition.key} (2026)`);
  assert.ok(directory.startsWith(moviesRoot + '\\'), 'Fixture escaped its dedicated media directory');
  await mkdir(directory, { recursive: true });
  const video = join(directory, 'fixture.mp4');
  if (!definition.hdr) {
    try { await stat(video); } catch { await copyFile(sourceVideo, video); }
  } else {
    try { await stat(video); } catch {
      const result = spawnSync(join(lab, 'server/jellyfin/ffmpeg.exe'), [
        '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x183541:s=3840x2160:r=1',
        '-t', '3', '-an', '-c:v', 'libx265', '-preset', 'ultrafast', '-crf', '32', '-pix_fmt', 'yuv420p10le',
        '-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc',
        '-x265-params', 'log-level=error:pools=2:frame-threads=1:hdr10=1:repeat-headers=1',
        '-tag:v', 'hvc1', '-movflags', '+faststart', video
      ], { encoding: 'utf8', windowsHide: true, timeout: 120_000 });
      assert.equal(result.status, 0, `HDR fixture encoding failed: ${result.error?.message || result.stderr}`);
    }
  }
  for (const [role, name] of [['poster', 'poster.jpg'], ['backdrop', 'backdrop.jpg'], ['logo', 'logo.png']]) {
    if (definition.omit !== role) await copyFile(join(source, name), join(directory, name));
  }
  const plot = definition.omit === 'overview' ? '' : `<plot>${xml('Original JellyTV test media. ' + definition.description + '. These imagined landscapes and metadata belong exclusively to the disposable validation library.')}</plot>`;
  const genres = (definition.genres || ['Adventure', 'Science Fiction']).map(genre => `<genre>${xml(genre)}</genre>`).join('');
  await writeFile(join(directory, 'movie.nfo'), `<?xml version="1.0" encoding="UTF-8"?>\n<movie><title>${xml(definition.name)}</title><originaltitle>${xml(definition.name)}</originaltitle><year>2026</year>${plot}<tagline>Original JellyTV validation media</tagline>${genres}<mpaa>TV-PG</mpaa><rating>8.4</rating><criticrating>87</criticrating><studio>JellyTV Local Lab</studio><lockdata>true</lockdata></movie>\n`);
}
console.log('Fixture files A–H prepared; starting one local library scan.');
await api('/Library/Refresh', 'POST');
let items;
for (let attempt = 0; attempt < 90; attempt++) {
  items = (await api(`/Items?userId=${credentials.admin.userId}&recursive=true&includeItemTypes=Movie,Series,Season,Episode,MusicAlbum,Audio,BoxSet&fields=Overview,Genres,MediaStreams,MediaSources,PrimaryImageAspectRatio,ChildCount,Studios`)).Items;
  if (definitions.every(definition => items.some(item => item.Name === definition.name && item.MediaStreams?.some(stream => stream.Type === 'Video')))) break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
const fixtures = {};
for (const definition of definitions) {
  const item = items.find(candidate => candidate.Name === definition.name);
  assert.ok(item, `Fixture ${definition.key} was not scanned`);
  const roles = { poster: !!item.ImageTags?.Primary, backdrop: !!item.BackdropImageTags?.length, logo: !!item.ImageTags?.Logo };
  for (const role of ['poster', 'backdrop', 'logo']) assert.equal(roles[role], definition.omit !== role, `Fixture ${definition.key}: unexpected ${role} availability`);
  assert.equal(!!item.Overview, definition.omit !== 'overview', `Fixture ${definition.key}: unexpected Overview availability`);
  if (definition.key === 'G') assert.equal(item.Genres.length, 12);
  if (definition.hdr) {
    const video = item.MediaStreams.find(stream => stream.Type === 'Video');
    assert.equal(video.Width, 3840);
    assert.equal(video.Height, 2160);
    assert.equal(video.ColorTransfer, 'smpte2084');
    assert.equal(video.ColorPrimaries, 'bt2020');
    assert.ok(/10/.test(video.Profile), 'Expected HEVC 10-bit profile');
  }
  fixtures[definition.key] = { id: item.Id, name: item.Name, type: item.Type, description: definition.description, roles,
    overview: !!item.Overview, genres: item.Genres.length, streams: item.MediaStreams.filter(stream => stream.Type === 'Video').map(({ Codec, Profile, Width, Height, ColorPrimaries, ColorTransfer, VideoRange, VideoRangeType }) => ({ Codec, Profile, Width, Height, ColorPrimaries, ColorTransfer, VideoRange, VideoRangeType })) };
}
const collectionName = 'JellyTV I — The Horizon Collection';
let collection = items.find(item => item.Type === 'BoxSet' && item.Name === collectionName);
if (!collection) collection = await api(`/Collections?name=${encodeURIComponent(collectionName)}&ids=${fixtures.A.id},${fixtures.B.id},${fixtures.C.id}&isLocked=true`, 'POST');
fixtures.I = { id: collection.Id, name: collectionName, type: 'BoxSet', description: 'Three accessible movie members; collection created locally' };
for (const [key, type] of [['J', 'Series'], ['K', 'Episode'], ['L', 'MusicAlbum']]) {
  const item = items.find(candidate => candidate.Type === type);
  assert.ok(item, `Missing ${type} fixture`);
  fixtures[key] = { id: item.Id, name: item.Name, type, description: `Existing original ${type} fixture` };
}
const artists = (await api(`/Artists?userId=${credentials.admin.userId}`)).Items;
const artist = artists.find(item => item.Name === 'JellyTV Lab');
assert.ok(artist, 'Music artist not available');
const dualAudio = items.find(item => item.Name === 'Two Frequencies');
assert.ok(dualAudio?.MediaStreams.filter(stream => stream.Type === 'Audio').length === 2, 'Dual audio fixture unavailable');
const local = { date: new Date().toISOString(), serverId: info.Id, serverVersion: info.Version, fixtures,
  routes: { artist: artist.Id, album: fixtures.L.id, track: items.find(item => item.Type === 'Audio')?.Id,
    season: items.find(item => item.Type === 'Season')?.Id, playback: dualAudio.Id } };
await mkdir(join(lab, 'evidence'), { recursive: true });
await writeFile(join(lab, 'evidence/vnext-fixtures.local.json'), JSON.stringify(local, null, 2) + '\n');
await mkdir('docs/comparison/10.10.6', { recursive: true });
await writeFile('docs/comparison/10.10.6/fixtures.json', JSON.stringify({ date: local.date, serverVersion: info.Version,
  source: 'original-local-media; no external provider queries',
  fixtures: Object.fromEntries(Object.entries(fixtures).map(([key, { id: _id, ...fixture }]) => [key, fixture])) }, null, 2) + '\n');
console.log('Fixtures A–L verified. Local IDs retained only in the private lab manifest.');
