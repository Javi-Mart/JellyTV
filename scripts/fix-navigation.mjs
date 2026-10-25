import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixWebCompatibility, runCompatibilityCLI } from './fix-web-compat.mjs';

export const fixNavigation = options => fixWebCompatibility({ ...options, patch: 'navigation' });
export const navigationManifestPath = fileURLToPath(new URL('../web-compat/navigation.json', import.meta.url));
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await runCompatibilityCLI('navigation');
