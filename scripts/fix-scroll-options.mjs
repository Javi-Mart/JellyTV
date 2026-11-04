import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixWebCompatibility, runCompatibilityCLI } from './fix-web-compat.mjs';

export const fixScrollOptions = options => fixWebCompatibility({ ...options, patch: 'scroll-options-10.10.6' });
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await runCompatibilityCLI('scroll-options-10.10.6');
