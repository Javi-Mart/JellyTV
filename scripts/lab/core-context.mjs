import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/** Serve the installer's untouched HTML/config only to this browser context.
 * Keeps Core controls clean even when Enhanced is installed in the shared lab.
 * Does not alter the server or its integration manifest. */
export async function isolateCore(context, baseURL, webroot) {
  assert.equal(baseURL, 'http://127.0.0.1:18997');
  let state;
  try { state = JSON.parse(await readFile(`${webroot}/.jellytv-install.json`, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const original = async name => state
    ? Buffer.from(state.original[name], 'base64').toString('utf8')
    : readFile(`${webroot}/${name}`, 'utf8');
  const html = await original('index.html');
  const config = JSON.parse(await original('config.json'));
  assert.ok(!/JellyTVEnhanced|jellytv\/jellytv-enhanced/i.test(html), 'Core context requires untouched HTML');
  assert.ok(Array.isArray(config.plugins) && !config.plugins.includes('JellyTVEnhanced'), 'Core context requires untouched plugin configuration');
  await context.route(url => url.origin === baseURL && ['/web/', '/web/index.html'].includes(url.pathname),
    route => route.fulfill({ contentType: 'text/html', body: html }));
  await context.route(url => url.origin === baseURL && url.pathname === '/web/config.json',
    route => route.fulfill({ json: config }));
}
