/**
 * The command line of the Flags SDK:
 *
 * ```sh
 * flags manifest [dir] [--out <file>]
 * flags sync [dir] [--production]
 * flags watch [dir] [--production] [-- command ...args]
 * ```
 *
 * `flags sync` writes the modules of `flags:<source>` from the catalogs of
 * `flags/sources` one time (see `generate.ts`). `flags watch` writes them
 * again after each change of a catalog, and can start a command, e.g. a
 * development server, after the first modules exist. Both load the `.env`
 * files of the directory first, for the credentials of the catalogs.
 *
 * `flags manifest` is for applications without a framework plugin, e.g.
 * Hono on Node.js. It imports the modules with the `'use flags'` directive in `dir` (the
 * default is the current directory) with Node.js, and writes the manifest of
 * their flags, by default to `flags-manifest.json` in `dir`. If it finds
 * `flags.config.ts` (in `dir`, its `src`, or the current directory), it
 * loads it for the default source. Run it after the
 * build, on the output of the build, or on the source if Node.js can run it,
 * e.g. TypeScript with type stripping.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MANIFEST_FILE } from './build-manifest';
import type { Config } from './config';
import { findConfigFile } from './config-file';
import { loadEnvFiles } from './env-files';
import { findFlagsModules } from './find-flags-modules';
import { type FlagsAliases, generateFlags, watchFlags } from './generate';
import { createManifest } from './manifest';
import { runtime } from './runtime';

const usage = [
  'Usage: flags manifest [dir] [--out <file>]',
  '       flags sync [dir] [--production]',
  '       flags watch [dir] [--production] [-- command ...args]',
].join('\n');

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
  // Flags without a source use the default source of
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
  if (command === 'manifest') {
    return manifest(args);
  }
  if (command === 'sync') {
    return sync(args);
  }
  if (command === 'watch') {
    return watch(args);
  }
  return Promise.reject(new Error(usage));
}

interface GenerateArgs {
  readonly root: string;
  readonly command: readonly string[];
}

/**
 * Reads `[dir] [--production] [-- command ...args]`, and loads the `.env`
 * files of the directory.
 */
function prepareGenerate(args: string[], allowCommand: boolean): GenerateArgs {
  const separator = args.indexOf('--');
  const options = separator === -1 ? args : args.slice(0, separator);
  const command = separator === -1 ? [] : args.slice(separator + 1);
  if (separator !== -1 && (!allowCommand || command.length === 0)) {
    throw new Error(usage);
  }
  let dir: string | undefined;
  let production = process.env.NODE_ENV === 'production';
  for (const option of options) {
    if (option === '--production') {
      production = true;
    } else if (option.startsWith('-') || dir !== undefined) {
      throw new Error(usage);
    } else {
      dir = option;
    }
  }
  const root = resolve(dir ?? '.');
  loadEnvFiles(root, production ? 'production' : 'development');
  return { root, command };
}

function describeAliases(aliases: FlagsAliases): string {
  const names = Object.keys(aliases);
  if (names.length === 0) {
    return 'flags: No sources in flags/sources.';
  }
  return `flags: Wrote the modules of ${names.join(', ')}.`;
}

/**
 * Writes the modules of the sources one time.
 *
 * @internal
 */
export async function sync(args: string[]): Promise<string> {
  const { root } = prepareGenerate(args, false);
  return describeAliases(await generateFlags(root));
}

/**
 * Writes the modules of the sources after each change of a catalog, until
 * the process gets SIGINT or SIGTERM, or the command ends.
 *
 * @internal
 */
export async function watch(args: string[]): Promise<string> {
  const { root, command } = prepareGenerate(args, true);
  const controller = new AbortController();
  let child: ChildProcess | undefined;
  let childExit: Promise<number> | undefined;
  let done: Promise<void> | undefined;
  const stop = (signal: 'SIGINT' | 'SIGTERM') => {
    process.exitCode = signal === 'SIGINT' ? 130 : 143;
    controller.abort();
    child?.kill(signal);
  };
  const interrupt = () => stop('SIGINT');
  const terminate = () => stop('SIGTERM');
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);

  try {
    const result = await watchFlags(root, { signal: controller.signal });
    done = result.done;
    console.log(`${describeAliases(result.aliases)} Watching the catalogs.`);
    if (command.length === 0) {
      await done;
      return 'flags: Stopped watching the catalogs.';
    }
    controller.signal.throwIfAborted();
    // The modules exist before the command starts, e.g. a server
    const [file, ...commandArgs] = command as [string, ...string[]];
    const started = spawn(file, commandArgs, { stdio: 'inherit' });
    child = started;
    childExit = new Promise<number>((resolveExit, reject) => {
      started.once('error', reject);
      started.once('exit', (code, signal) => {
        if (signal) {
          resolveExit(signal === 'SIGINT' ? 130 : 143);
        } else {
          resolveExit(code ?? 1);
        }
      });
    });
    // A catalog without updates can end while the command still runs
    const watchFailure = done.then(() => new Promise<never>(() => {}));
    process.exitCode = await Promise.race([childExit, watchFailure]);
    return 'flags: The command ended. Stopped watching the catalogs.';
  } catch (error) {
    if (controller.signal.aborted) {
      return 'flags: Stopped watching the catalogs.';
    }
    throw error;
  } finally {
    controller.abort();
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      const timeout = setTimeout(() => child?.kill('SIGKILL'), 5000);
      try {
        await childExit?.catch(() => {});
      } finally {
        clearTimeout(timeout);
      }
    }
    await done?.catch(() => {});
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
  }
}
