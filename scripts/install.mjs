import { readFile, writeFile, mkdir, rename, rm, rmdir, lstat, realpath } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const tracked = ['index.html', 'config.json', 'jellytv/jellytv-enhanced.css', 'jellytv/jellytv-enhanced.js'];
const marker = '.jellytv-install.json';
const journalName = '.jellytv-recovery.json';
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
async function readOptional(path) { try { return await readFile(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
async function snapshot(root) {
  const files = {};
  for (const name of tracked) { const content = await readOptional(join(root, name)); files[name] = content?.toString('base64') ?? null; }
  return files;
}
async function atomic(path, content) {
  const temp = `${path}.jellytv-tmp`;
  await writeFile(temp, content, { flag: 'wx' });
  try { await rename(temp, path); } catch (error) { await rm(temp, { force: true }); throw error; }
}
async function restore(root, files) {
  for (const name of tracked) {
    const path = join(root, name);
    if (files[name] === null) await rm(path, { force: true });
    else { await mkdir(dirname(path), { recursive: true }); await atomic(path, Buffer.from(files[name], 'base64')); }
  }
}
async function verify(root, state) {
  for (const name of tracked) {
    const current = await readOptional(join(root, name));
    if (!current || hash(current) !== state.installed[name]) throw new Error(`Refusing to overwrite changed file: ${name}. Restore your matching backup or merge changes manually.`);
  }
}

function validSnapshot(files) {
  return files && Object.keys(files).length === tracked.length && tracked.every(name =>
    Object.hasOwn(files, name) && (files[name] === null || (typeof files[name] === 'string' && Buffer.from(files[name], 'base64').toString('base64') === files[name])));
}

async function recover(root, journal, dryRun) {
  if (journal.schema !== 1 || !validSnapshot(journal.before) || !validSnapshot(journal.after)
    || ![journal.manifest, journal.nextManifest].every(value => value === null || typeof value === 'string')) {
    throw new Error('Unsupported recovery journal. Preserve it and inspect the backup manually; no files changed.');
  }
  const originals = { ...journal.before, [marker]: journal.manifest };
  const planned = { ...journal.after, [marker]: journal.nextManifest };
  const staleTemps = [];
  // A crash may leave any mixture of the two recorded generations. Never overwrite a third version.
  for (const name of [...tracked, marker]) {
    const current = (await readOptional(join(root, name)))?.toString('base64') ?? null;
    if (current !== originals[name] && current !== planned[name]) throw new Error(`Refusing to recover changed file: ${name}`);
    const temp = await readOptional(join(root, `${name}.jellytv-tmp`));
    if (temp) {
      if (![originals[name], planned[name]].includes(temp.toString('base64'))) throw new Error(`Refusing to remove unrecognized temporary file: ${name}.jellytv-tmp`);
      staleTemps.push(join(root, `${name}.jellytv-tmp`));
    }
  }
  if (dryRun) return { action: 'recover', dryRun: true, root, files: tracked };
  for (const temp of staleTemps) await rm(temp);
  await restore(root, journal.before);
  if (journal.manifest === null) await rm(join(root, marker), { force: true });
  else await atomic(join(root, marker), Buffer.from(journal.manifest, 'base64'));
  await rm(join(root, journalName));
  try { await rmdir(join(root, 'jellytv')); } catch (e) { if (e.code !== 'ENOTEMPTY' && e.code !== 'ENOENT') throw e; }
  return { action: 'recover', root, recovered: true };
}

export async function install({ action, root: rootPath, webVersion, dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist'), dryRun = false }) {
  if (!rootPath || !['install', 'update', 'uninstall', 'rollback', 'status', 'recover'].includes(action)) throw new Error('Usage: node scripts/install.mjs install|update|rollback|uninstall|status|recover --root <webroot> [--web-version 10.10.6|12.2] [--dry-run]');
  const root = await realpath(resolve(rootPath));
  for (const name of ['jellytv', ...tracked, marker, journalName, ...[...tracked, marker].map(name => `${name}.jellytv-tmp`)]) {
    try { if ((await lstat(join(root, name))).isSymbolicLink()) throw new Error(`Symlink is not supported: ${name}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const recovery = join(root, journalName);
  const journal = await readOptional(recovery);
  if (journal) {
    if (action === 'recover') return recover(root, JSON.parse(journal.toString()), dryRun);
    if (action === 'status') return { root, recoveryPending: true };
    throw new Error('An interrupted operation needs recovery. Run recover --dry-run, then recover. No files changed.');
  }
  if (action === 'recover') return { action, root, recovered: false, reason: 'No recovery journal found' };
  const saved = await readOptional(join(root, marker));
  const state = saved ? JSON.parse(saved.toString()) : null;
  if (action === 'status') {
    if (state) await verify(root, state);
    return { installed: Boolean(state), version: state?.version, root };
  }
  if (state) await verify(root, state);
  if (action === 'install' && state) throw new Error('Already installed; use update. No files changed.');
  if (action !== 'install' && !state) throw new Error('No JellyTV installation manifest found. No files changed.');
  const before = await snapshot(root);
  let after, nextState;
  if (action === 'uninstall' || (action === 'rollback' && !state.previous)) {
    after = state.original; nextState = null;
  } else if (action === 'rollback') {
    after = state.previous.files; nextState = state.previous.state;
  } else {
    if (!['10.10.6', '12.2'].includes(webVersion)) throw new Error('Only verified web version contracts 10.10.6 and 12.2 can be targeted. Pass --web-version after confirming the web distribution version.');
    if (state && state.webVersion !== webVersion) throw new Error('Web version changed. Uninstall the existing integration before targeting another web distribution.');
    if (webVersion === '10.10.6') {
      // The 10.10.6 plugin-manager contract was audited in these exact bytes.
      // Server version alone does not identify the installed web distribution.
      const profile = JSON.parse(await readFile(new URL('../web-compat/scroll-options-10.10.6.json', import.meta.url), 'utf8'));
      const bundlePath = join(root, profile.file);
      const info = await lstat(bundlePath).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (!info?.isFile() || info.isSymbolicLink()) throw new Error('Pinned Jellyfin Web 10.10.6 bundle is missing or is not a regular file.');
      const checksum = hash(await readFile(bundlePath));
      if (![profile.originalSha256, profile.patchedSha256].includes(checksum)) throw new Error('Unknown Jellyfin Web 10.10.6 bundle. No files changed.');
    }
    const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'));
    const original = state?.original ?? before;
    if (!original['index.html'] || !original['config.json']) throw new Error('Expected Jellyfin index.html and config.json.');
    const html = Buffer.from(original['index.html'], 'base64').toString();
    if (!/<head(?:\s[^>]*)?>/i.test(html) || /<script\b[^>]*\basync(?:[\s=>])/i.test(html)) throw new Error('Unsupported HTML: requires head and ordered deferred scripts.');
    if (/JellyTVEnhanced|jellytv\/jellytv-enhanced/i.test(html)) throw new Error('Unmanaged JellyTV references found. Restore a clean webroot first.');
    if (!state && (before[tracked[2]] || before[tracked[3]])) throw new Error('Refusing to overwrite pre-existing jellytv assets.');
    const config = JSON.parse(Buffer.from(original['config.json'], 'base64').toString());
    if (!Array.isArray(config.plugins) || !config.plugins.every(p => typeof p === 'string')) throw new Error('config.json must contain the existing plugins array.');
    if (config.plugins.includes('JellyTVEnhanced')) throw new Error('Unmanaged JellyTV plugin entry already exists.');
    config.plugins.push('JellyTVEnhanced');
    const insertion = `\n<!-- JellyTV ${manifest.version}: remove using the installer manifest -->\n<link rel="stylesheet" href="jellytv/jellytv-enhanced.css?v=${manifest.version}">\n<script defer src="jellytv/jellytv-enhanced.js?v=${manifest.version}"></script>\n`;
    after = { 'index.html': Buffer.from(html.replace(/<head(?:\s[^>]*)?>/i, match => match + insertion)).toString('base64'), 'config.json': Buffer.from(JSON.stringify(config, null, 2) + '\n').toString('base64') };
    for (const name of tracked.slice(2)) {
      const basename = name.split('/')[1];
      const content = await readFile(join(dist, basename));
      if (hash(content) !== manifest.assets[basename]?.sha256) throw new Error(`Distribution integrity check failed: ${basename}`);
      after[name] = content.toString('base64');
    }
    nextState = { version: manifest.version, webVersion, original, installed: Object.fromEntries(tracked.map(name => [name, hash(Buffer.from(after[name], 'base64'))])), previous: state ? { files: before, state: { ...state, previous: null } } : null };
  }
  if (dryRun) return { action, dryRun: true, root, files: tracked };
  // Backup is committed before mutations. It is retained if interruption occurs mid-operation.
  const nextManifest = nextState ? Buffer.from(JSON.stringify(nextState, null, 2) + '\n') : null;
  await writeFile(recovery, JSON.stringify({ schema: 1, before, after, manifest: saved?.toString('base64') ?? null, nextManifest: nextManifest?.toString('base64') ?? null }), { flag: 'wx' });
  try {
    // Assets first, config last: the plugin name never points to a missing new bundle.
    await mkdir(join(root, 'jellytv'), { recursive: true });
    for (const name of [...tracked.slice(2), tracked[0], tracked[1]]) {
      if (after[name] === null) await rm(join(root, name), { force: true });
      else await atomic(join(root, name), Buffer.from(after[name], 'base64'));
    }
    if (nextState) await atomic(join(root, marker), nextManifest);
    else await rm(join(root, marker), { force: true });
  } catch (error) {
    await restore(root, before);
    if (saved) await writeFile(join(root, marker), saved); else await rm(join(root, marker), { force: true });
    await rm(recovery);
    throw error;
  }
  await rm(recovery);
  if (!nextState) { try { await rmdir(join(root, 'jellytv')); } catch (e) { if (e.code !== 'ENOTEMPTY' && e.code !== 'ENOENT') throw e; } }
  return { action, version: nextState?.version, root, restoredOriginal: !nextState };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [action, ...args] = process.argv.slice(2);
  const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  try { console.log(JSON.stringify(await install({ action, root: option('--root'), webVersion: option('--web-version'), dryRun: args.includes('--dry-run') }), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
