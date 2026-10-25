import { readFile, writeFile, lstat, realpath, rename, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
async function optional(path) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Refusing non-regular file: ' + path);
    return await readFile(path);
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** One pinned upstream bug fix; no guessed bundle names or broad search/replace. */
export async function fixWebCompatibility({ root, action, dryRun = false, patch }) {
  if (!['quick-connect', 'navigation', 'scroll-options-10.10.6'].includes(patch)) throw new Error('Unknown compatibility patch');
  const manifestPath = new URL(`../web-compat/${patch}.json`, import.meta.url);
  if (!root || !['apply', 'revert', 'status'].includes(action)) throw new Error('Expected apply|revert|status --root WEBROOT [--dry-run]');
  const directory = resolve(root);
  if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== directory) throw new Error('Refusing aliased webroot');
  const spec = JSON.parse(await readFile(manifestPath, 'utf8'));
  const target = join(directory, spec.file);
  const backup = join(directory, `.jellytv-${patch}.original`);
  const temp = join(directory, `.jellytv-${patch}.tmp`);
  const current = await optional(target);
  if (!current) throw new Error(`Pinned Jellyfin Web ${spec.webVersion} frontend bundle is missing`);
  const checksum = hash(current);
  if (![spec.originalSha256, spec.patchedSha256].includes(checksum)) throw new Error('Unknown or edited frontend bundle; no files changed');
  const original = await optional(backup);
  if (original && hash(original) !== spec.originalSha256) throw new Error('Backup has been edited; no files changed');
  const state = checksum === spec.patchedSha256 ? 'PATCHED' : 'ORIGINAL';
  const result = { action, state, file: spec.file, sha256: checksum, dryRun };
  if (action === 'status') return result;
  if (action === 'apply' && state === 'PATCHED') return result;
  if (action === 'revert' && state === 'ORIGINAL') return result;
  let next;
  if (action === 'apply') {
    const text = current.toString('utf8');
    if (text.split(spec.before).length !== 2) throw new Error('Pinned call-site is not unique');
    next = Buffer.from(text.replace(spec.before, spec.after));
    if (hash(next) !== spec.patchedSha256) throw new Error('Patched content does not match reviewed checksum');
  } else {
    if (!original) throw new Error('Original backup is required for revert');
    next = original;
  }
  const stale = await optional(temp);
  if (stale && ![spec.originalSha256, spec.patchedSha256].includes(hash(stale))) throw new Error('Unknown temporary file; preserve it for manual review');
  if (dryRun) return { ...result, nextState: action === 'apply' ? 'PATCHED' : 'ORIGINAL' };
  if (action === 'apply' && !original) await writeFile(backup, current, { flag: 'wx' });
  if (stale) await rm(temp);
  await writeFile(temp, next, { flag: 'wx' });
  await rename(temp, target);
  return { ...result, state: action === 'apply' ? 'PATCHED' : 'ORIGINAL', sha256: hash(next) };
}

export async function runCompatibilityCLI(patch) {
  const args = process.argv.slice(2);
  try {
    const rootIndex = args.indexOf('--root');
    console.log(JSON.stringify(await fixWebCompatibility({ patch, action: args[0], root: rootIndex < 0 ? undefined : args[rootIndex + 1], dryRun: args.includes('--dry-run') }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
