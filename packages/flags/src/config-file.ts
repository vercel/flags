import { existsSync } from 'node:fs';
import { join } from 'node:path';

// In the folder `flags` of the application, next to `flags/sources`
const configFileNames = [
  'flags/config.ts',
  'flags/config.mts',
  'flags/config.js',
  'flags/config.mjs',
];

/**
 * Finds `flags/config.ts`, in the directory of the application or in its
 * `src` directory.
 */
export function findConfigFile(dir: string): string | undefined {
  for (const base of [dir, join(dir, 'src')]) {
    for (const name of configFileNames) {
      const file = join(base, name);
      if (existsSync(file)) return file;
    }
  }
  return undefined;
}
