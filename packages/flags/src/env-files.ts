import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Loads the `.env` files of a directory into `process.env`, in the order of
 * most frameworks: `.env.<mode>.local`, `.env.local`, `.env.<mode>`, `.env`.
 * A file earlier in the list wins, and a variable which is already set
 * wins over all files. The catalogs often need credentials of these files,
 * e.g. after `vercel env pull`.
 *
 * @internal
 */
export function loadEnvFiles(
  directory: string,
  mode: 'development' | 'production',
): void {
  const files = [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env'];
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(path.join(directory, file), 'utf8');
    } catch {
      continue;
    }
    for (const [name, value] of Object.entries(parseEnv(content))) {
      if (process.env[name] === undefined) {
        process.env[name] = value;
      }
    }
  }
}
