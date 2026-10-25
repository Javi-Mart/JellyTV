import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixWebCompatibility, runCompatibilityCLI } from './fix-web-compat.mjs';

export const fixQuickConnect = options => fixWebCompatibility({ ...options, patch: 'quick-connect' });
export const quickConnectManifestPath = fileURLToPath(new URL('../web-compat/quick-connect.json', import.meta.url));
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await runCompatibilityCLI('quick-connect');
