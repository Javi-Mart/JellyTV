import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const profile = process.argv.includes('--profile=10.10.6') ? '10.10.6' : '12.2';
const labPath = profile === '10.10.6' ? '../../.lab/vnext-10.10.6/' : '../../.lab/';
const expectedVersion = profile === '10.10.6' ? '10.10.6' : '12.2.0';
const baseURL = profile === '10.10.6' ? 'http://127.0.0.1:18997' : 'http://127.0.0.1:18996';
const credentialsFile = new URL(labPath + 'credentials.local.json', import.meta.url);
let credentials;
try { credentials = JSON.parse(await readFile(credentialsFile, 'utf8')); }
catch { credentials = { baseURL, admin: { username: 'JellyTV Admin', password: randomBytes(24).toString('base64url') }, limited: { username: 'JellyTV Viewer', password: randomBytes(24).toString('base64url') } }; }
let token;
async function api(path, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json', Authorization: `MediaBrowser Client="JellyTV Lab", Device="Local validation", DeviceId="jellytv-local-validation", Version="0.1.0"${token ? `, Token="${token}"` : ''}` };
  const response = await fetch(baseURL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`${method} ${path.split('?')[0]}: ${response.status} ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}
const info = await api('/System/Info/Public');
if (info.Version !== expectedVersion) throw new Error(`Expected isolated Jellyfin ${expectedVersion} lab`);
if (credentials.baseURL !== baseURL) throw new Error('Credential destination does not match the selected loopback lab');
if (credentials.serverId && credentials.serverId !== info.Id) throw new Error('Lab identity changed; refusing to modify an unknown server');
await writeFile(credentialsFile, JSON.stringify(credentials, null, 2));
if (!info.StartupWizardCompleted) {
  // 10.10 initializes its first local user while opening the wizard's user step.
  if (profile === '10.10.6') await api('/Startup/User');
  await api('/Startup/User', 'POST', { Name: credentials.admin.username, Password: credentials.admin.password });
  await api('/Startup/Configuration', 'POST', { UICulture: 'en-US', MetadataCountryCode: 'US', PreferredMetadataLanguage: 'en' });
  await api('/Startup/RemoteAccess', 'POST', { EnableRemoteAccess: false, EnableAutomaticPortMapping: false });
  await api('/Startup/Complete', 'POST');
}
const login = await api('/Users/AuthenticateByName', 'POST', { Username: credentials.admin.username, Pw: credentials.admin.password });
token = login.AccessToken;
credentials.admin.userId = login.User.Id;
credentials.admin.accessToken = token;
credentials.serverId = login.ServerId;
const users = await api('/Users');
let viewer = users.find(user => user.Name === credentials.limited.username);
if (!viewer) viewer = await api('/Users/New', 'POST', { Name: credentials.limited.username, Password: credentials.limited.password });
credentials.limited.userId = viewer.Id;
await api(`/Users/${viewer.Id}/Policy`, 'POST', { ...viewer.Policy, IsAdministrator: false, EnableContentDeletion: false, EnableAllFolders: true, EnableRemoteAccess: false });
const libraries = await api('/Library/VirtualFolders');
for (const [name, type, folder] of [['Lab Movies', 'movies', 'Movies'], ['Lab Shows', 'tvshows', 'Shows'], ['Lab Music', 'music', 'Music']]) {
  if (libraries.some(library => library.Name === name)) continue;
  const path = fileURLToPath(new URL(`${labPath}media/${folder}`, import.meta.url));
  const typeOptions = ['Movie', 'Series', 'Season', 'Episode', 'MusicAlbum', 'MusicArtist', 'Audio'].map(Type => ({ Type, MetadataFetchers: [], ImageFetchers: [], ImageOptions: [] }));
  await api(`/Library/VirtualFolders?name=${encodeURIComponent(name)}&collectionType=${type}&refreshLibrary=false`, 'POST', { LibraryOptions: { Enabled: true, PathInfos: [{ Path: path }], EnableRealtimeMonitor: false, EnableInternetProviders: false, EnableChapterImageExtraction: false, EnableTrickplayImageExtraction: false, EnableLUFSScan: false, MetadataSavers: [], TypeOptions: typeOptions, EnableAutomaticSeriesGrouping: false } });
}
await api('/Library/Refresh', 'POST');
let items;
for (let attempt = 0; attempt < 60; attempt++) {
  items = await api(`/Items?userId=${login.User.Id}&recursive=true&includeItemTypes=Movie,Series,Season,Episode,MusicAlbum,Audio&fields=Path,MediaSources,Overview,Genres,ImageTags`);
  if (items.Items.filter(item => item.Type === 'Movie').length === 8 && items.Items.filter(item => item.Type === 'Episode').length === 6) break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (items.Items.filter(item => item.Type === 'Movie').length !== 8) throw new Error('Movie fixtures not fully scanned');
const resume = items.Items.find(item => item.Name === 'The Quiet Horizon');
const favorite = items.Items.find(item => item.Name === 'Tides of Tomorrow');
const episode = items.Items.find(item => item.Type === 'Episode' && item.ParentIndexNumber === 1 && item.IndexNumber === 1);
for (const user of [credentials.admin, credentials.limited]) {
  await api(`/UserItems/${resume.Id}/UserData?userId=${user.userId}`, 'POST', { PlaybackPositionTicks: 1800000000, PlayCount: 1, Played: false, LastPlayedDate: new Date().toISOString() });
  await api(`/UserItems/${favorite.Id}/UserData?userId=${user.userId}`, 'POST', { IsFavorite: true });
  await api(`/UserItems/${episode.Id}/UserData?userId=${user.userId}`, 'POST', { Played: true, PlayCount: 1, LastPlayedDate: new Date().toISOString() });
}
const viewerLogin = await api('/Users/AuthenticateByName', 'POST', { Username: credentials.limited.username, Pw: credentials.limited.password });
credentials.limited.accessToken = viewerLogin.AccessToken;
credentials.items = Object.fromEntries(items.Items.map(item => [`${item.Type}:${item.Name}${item.Type === 'Episode' ? `:S${item.ParentIndexNumber}E${item.IndexNumber}` : ''}`, item.Id]));
credentials.views = (await api(`/UserViews?userId=${login.User.Id}`)).Items.map(({ Id, Name, CollectionType }) => ({ Id, Name, CollectionType }));
await writeFile(credentialsFile, JSON.stringify(credentials, null, 2));
await writeFile(new URL(labPath + 'evidence/fixtures.json', import.meta.url), JSON.stringify({ serverVersion: info.Version, serverId: info.Id, views: credentials.views, items: items.Items.map(({ Id, Name, Type, ParentIndexNumber, IndexNumber, ImageTags }) => ({ Id, Name, Type, ParentIndexNumber, IndexNumber, ImageTags })) }, null, 2));
console.log(JSON.stringify({ baseURL, credentialsFile: fileURLToPath(credentialsFile), serverVersion: info.Version, counts: Object.groupBy(items.Items.map(({ Type }) => Type), type => type), fixtureIDs: { resume: resume.Id, favorite: favorite.Id, episode: episode.Id } }, null, 2));
