import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { fixWebCompatibility, runCompatibilityCLI } from './fix-web-compat.mjs';

export const fixNavigation106 = options => fixWebCompatibility({ ...options, patch: 'navigation-10.10.6' });
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCompatibilityCLI('navigation-10.10.6');
