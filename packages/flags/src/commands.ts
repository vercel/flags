/**
 * The command line of the Flags SDK. For applications without a framework
 * plugin, e.g. Hono on Node.js:
 *
 * ```sh
 * flags manifest [dir] [--out <file>]
 * ```
 *
 * It imports the modules with the `'use flags'` directive in `dir` (the
 * default is the current directory) with Node.js, and writes the manifest of
 * their flags, by default to `flags-manifest.json` in `dir`. If it finds
 * `flags.config.ts` (in `dir`, its `src`, or the current directory), it
 * loads it for the default connection. Run it after the
 * build, on the output of the build, or on the source if Node.js can run it,
 * e.g. TypeScript with type stripping.
 */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MANIFEST_FILE } from './build-manifest';
import type { Config } from './config';
import { findConfigFile } from './config-file';
import { findFlagsModules } from './find-flags-modules';
import { createManifest } from './manifest';
import { runtime } from './runtime';

const usage = 'Usage: flags manifest [dir] [--out <file>]';

/**
 * Writes the manifest. Returns the message for the console.
 *
 * @internal
 */
export async function manifest(args: string[]): Promise<string> {
  let dir: string | undefined;
  let out: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--out') out = args[++i];
    else if (arg?.startsWith('-')) throw new Error(usage);
    else dir = arg;
  }
  const root = resolve(dir ?? '.');
  const output = resolve(out ?? join(root, MANIFEST_FILE));
  const modules = [];
  for (const id of findFlagsModules(root)) {
    const exports = await import(pathToFileURL(join(root, id)).href);
    modules.push({ id, exports: { ...exports } });
  }
  // Flags without a connection use the default connection of
  // flags.config.ts, if the project has one
  const configFile = findConfigFile(root) ?? findConfigFile(process.cwd());
  if (configFile) {
    const { config } = (await import(pathToFileURL(configFile).href)) as {
      config?: Config;
    };
    if (config) runtime.configure(config);
  }
  const result = createManifest(modules);
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  return `flags: Wrote ${output} with ${Object.keys(result.definitions).length} flags from ${modules.length} modules.`;
}

/**
 * Runs a command of the command line. Returns the message for the console.
 *
 * @internal
 */
export function runCommand(argv: string[]): Promise<string> {
  const [command, ...args] = argv;
  return command === 'manifest'
    ? manifest(args)
    : Promise.reject(new Error(usage));
}
