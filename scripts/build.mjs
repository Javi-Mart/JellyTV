import { build, transform } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const modules = ['tokens', 'base', 'components', 'animations', 'web', 'home', 'tablet', 'mobile', 'tv-web', 'compat/details-legacy', 'accessibility'];
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const root = new URL('../', import.meta.url);
await mkdir(new URL('dist/', root), { recursive: true });
const core = (await Promise.all(modules.map(name => readFile(new URL(`theme/${name}.css`, root), 'utf8')))).join('\n');
await writeFile(new URL('dist/jellytv-core.css', root), `/* JellyTV ${pkg.version} · MIT · Web 10.10.6 / 12.2 structural profiles */\n${core}`);
await writeFile(new URL('dist/jellytv-core.min.css', root), (await transform(core, { loader: 'css', minify: true, target: 'chrome109' })).code);
const hero = await readFile(new URL('enhanced/hero.css', root), 'utf8');
await writeFile(new URL('dist/jellytv-enhanced.css', root), (await transform(hero, { loader: 'css', minify: true, target: 'chrome109' })).code);
await build({ entryPoints: [fileURLToPath(new URL('enhanced/plugin.mjs', root))], bundle: true, format: 'iife', target: 'es2020', minify: true, outfile: fileURLToPath(new URL('dist/jellytv-enhanced.js', root)), legalComments: 'eof' });
const assets = {};
for (const name of ['jellytv-core.css', 'jellytv-core.min.css', 'jellytv-enhanced.css', 'jellytv-enhanced.js']) {
  const buffer = await readFile(new URL(`dist/${name}`, root));
  assets[name] = { bytes: buffer.length, gzipBytes: gzipSync(buffer).length, sha256: createHash('sha256').update(buffer).digest('hex') };
}
if (assets['jellytv-enhanced.js'].gzipBytes > 60 * 1024 || assets['jellytv-core.min.css'].gzipBytes + assets['jellytv-enhanced.css'].gzipBytes > 35 * 1024) throw new Error('Asset budget exceeded');
await writeFile(new URL('dist/manifest.json', root), JSON.stringify({
  version: pkg.version,
  webVersions: ['10.10.6', '12.2'],
  validationStatus: 'development',
  profiles: ['legacy-nested-detail-10.10.6', 'legacy-direct-detail-12.2', 'modern-12.2'],
  assets
}, null, 2) + '\n');
console.log(JSON.stringify({ version: pkg.version, assets }, null, 2));
