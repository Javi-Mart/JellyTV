import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const credentials = JSON.parse(await readFile('.lab/credentials.local.json', 'utf8'));
assert.equal(credentials.baseURL, 'http://127.0.0.1:18996');
const headers = { Authorization: `MediaBrowser Client="JellyTV Lab", Device="Local validation", DeviceId="jellytv-local-validation", Version="0.1.0", Token="${credentials.admin.accessToken}"` };
async function api(path, method = 'GET') {
  const response = await fetch(credentials.baseURL + path, { method, headers });
  assert.ok(response.ok, `${method} ${path.split('?')[0]}: ${response.status}`);
  return response.status === 204 ? null : response.json();
}
const server = await api('/System/Info/Public');
assert.equal(server.Id, credentials.serverId, 'Only the existing disposable lab may be modified');
assert.equal(server.Version, '12.2.0');
// Generate the separate media first with generate-fixtures.py --extended-only.
await readFile('.lab/media/Movies/Two Frequencies (2020)/Two Frequencies.mp4');
await api('/Library/Refresh', 'POST');
let movie;
for (let attempt = 0; attempt < 45 && !movie; attempt++) {
  movie = (await api(`/Items?userId=${credentials.admin.userId}&recursive=true&includeItemTypes=Movie&fields=MediaStreams&searchTerm=Two%20Frequencies`)).Items.find(item => item.Name === 'Two Frequencies');
  if (!movie) await new Promise(resolve => setTimeout(resolve, 1000));
}
assert.ok(movie, 'Dual-audio fixture was not scanned');
assert.equal(movie.MediaStreams.filter(stream => stream.Type === 'Audio').length, 2);
const name = 'JellyTV Validation Collection';
let collection = (await api(`/Items?userId=${credentials.admin.userId}&recursive=true&includeItemTypes=BoxSet`)).Items.find(item => item.Name === name);
if (!collection) collection = await api(`/Collections?name=${encodeURIComponent(name)}&ids=${movie.Id},${credentials.items['Movie:Aster Vale']}&isLocked=true`, 'POST');
const fixtures = { serverId: server.Id, movie: movie.Id, collection: collection.Id, collectionName: name };
await writeFile('.lab/extended-fixtures.local.json', JSON.stringify(fixtures, null, 2));
console.log('Extended fixtures ready: one two-track video and one dedicated collection; shared playback fixtures unchanged.');
