import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const credentials = JSON.parse(await readFile(new URL('.lab/credentials.local.json', root), 'utf8'));
if (credentials.baseURL !== 'http://127.0.0.1:18996') throw new Error('This helper only targets the isolated local lab.');
const headers = { 'Content-Type': 'application/json', Authorization: `MediaBrowser Client="JellyTV Lab", Device="Local validation", DeviceId="jellytv-local-validation", Version="0.1.0", Token="${credentials.admin.accessToken}"` };
const result = await fetch(credentials.baseURL + '/Branding/Configuration', { headers });
if (!result.ok) throw new Error(`Cannot read local branding: ${result.status}`);
const branding = await result.json();
const backup = new URL('.lab/branding-before.local.json', root);
try { await writeFile(backup, JSON.stringify(branding, null, 2), { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
const restore = process.argv.includes('--restore');
const body = restore ? JSON.parse(await readFile(backup, 'utf8')) : { ...branding, CustomCss: await readFile(new URL('dist/jellytv-core.css', root), 'utf8') };
const saved = await fetch(credentials.baseURL + '/System/Configuration/branding', { method: 'POST', headers, body: JSON.stringify(body) });
if (!saved.ok) throw new Error(`Cannot save local branding: ${saved.status}`);
console.log(restore ? 'Local lab Branding restored.' : 'Core installed through local lab Branding.');
