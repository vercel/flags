/**
 * The command line of the Flags SDK:
 *
 * ```sh
 * flags manifest [dir] [--out <file>]
 * flags sync [dir]
 * flags watch [dir] [-- command ...args]
 * flags format [paths...] [--check]
 * flags format --stdin [--stdin-filepath <file>]
 * ```
 *
 * `flags sync` writes the modules of `flags:<source>` and the types of the
 * flags files one time (see `generate.ts`). `flags watch` writes them again
 * after each change of a flags file, and can start a command, e.g. a
 * development server, after the first modules exist. Neither uses the
 * network.
 *
 * `flags manifest` is for applications without a framework plugin, e.g.
 * Hono on Node.js. It imports the modules with the `'use flags'` directive in `dir` (the
 * default is the current directory) with Node.js, and writes the manifest of
 * their flags, by default to `flags-manifest.json` in `dir`. If it finds
 * `flags/config.ts` (in `dir`, its `src`, or the current directory), it
 * loads it. Run it after the
 * build, on the output of the build, or on the source if Node.js can run it,
 * e.g. TypeScript with type stripping.
 *
 * `flags format` formats the flags files (see `flags-file/format.ts`): the
 * files and the flags files of the folders in `paths` (the default is the
 * current directory). With `--check`, it writes nothing, and fails if a
 * file is not formatted. With `--stdin`, it formats the text of the
 * standard input to the standard output, for editors, e.g. as an external
 * formatter of Zed. `--stdin-filepath` gives the name of the file for the
 * errors.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MANIFEST_FILE } from './build-manifest';
import type { Config } from './config';
import { findConfigModules, readSettings } from './config-file';
import { findFlagsFiles, findFlagsModules } from './find-flags-modules';
import { FlagsFileError, formatDiagnostics } from './flags-file/compile';
import { formatFlagsFile } from './flags-file/format';
import { type FlagsAliases, generateFlags, watchFlags } from './generate';
import { createManifest } from './manifest';
import { runtime } from './runtime';

const usage = [
  'Usage: flags manifest [dir] [--out <file>]',
  '       flags sync [dir]',
  '       flags watch [dir] [-- command ...args]',
  '       flags format [paths...] [--check]',
  '       flags format --stdin [--stdin-filepath <file>]',
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
  // The configuration of the project, if it has one
  runtime.configure(await importConfig(root));
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
  if (command === 'format') {
    return format(args);
  }
  return Promise.reject(new Error(usage));
}

/**
 * The input and the output of `flags format --stdin`. Tests replace them.
 *
 * @internal
 */
export interface StandardStreams {
  readonly read: () => Promise<string>;
  readonly write: (text: string) => void;
}

const processStreams: StandardStreams = {
  read: async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
  },
  write: (text) => {
    process.stdout.write(text);
  },
};

/** The text of a `FlagsFileError`, with the line of the error */
function describeFormatError(
  error: unknown,
  fileName: string,
  text: string,
): Error {
  if (error instanceof FlagsFileError) {
    return new Error(
      `flags: ${fileName} has a syntax error, so it can not be formatted.\n\n${formatDiagnostics(fileName, text, error.diagnostics)}`,
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Formats flags files. Returns the message for the console, which is empty
 * with `--stdin`.
 *
 * @internal
 */
export async function format(
  args: string[],
  streams: StandardStreams = processStreams,
): Promise<string> {
  let check = false;
  let stdin = false;
  let stdinPath: string | undefined;
  const paths: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === '--check') {
      check = true;
    } else if (arg === '--stdin') {
      stdin = true;
    } else if (arg === '--stdin-filepath') {
      stdinPath = args[++i];
      if (stdinPath === undefined) {
        throw new Error(usage);
      }
    } else if (arg.startsWith('-')) {
      throw new Error(usage);
    } else {
      paths.push(arg);
    }
  }
  if (stdin) {
    if (check || paths.length > 0) {
      throw new Error(usage);
    }
    const text = await streams.read();
    const fileName = stdinPath ?? '<stdin>';
    try {
      streams.write(formatFlagsFile(text, { fileName }));
    } catch (error) {
      throw describeFormatError(error, fileName, text);
    }
    return '';
  }
  if (stdinPath !== undefined) {
    throw new Error(usage);
  }
  const files: string[] = [];
  for (const path of paths.length > 0 ? paths : ['.']) {
    const absolute = resolve(path);
    if (statSync(absolute).isDirectory()) {
      files.push(...findFlagsFiles(absolute).map((id) => join(absolute, id)));
    } else {
      files.push(absolute);
    }
  }
  const changed: string[] = [];
  for (const file of files) {
    const name = relative(process.cwd(), file) || file;
    const text = readFileSync(file, 'utf8');
    let formatted: string;
    try {
      formatted = formatFlagsFile(text, { fileName: name });
    } catch (error) {
      throw describeFormatError(error, name, text);
    }
    if (formatted !== text) {
      changed.push(name);
      if (!check) {
        writeFileSync(file, formatted);
      }
    }
  }
  const count = `${files.length} flags ${files.length === 1 ? 'file' : 'files'}`;
  if (check) {
    if (changed.length > 0) {
      throw new Error(
        `flags: These flags files are not formatted. Run flags format.\n${changed.map((name) => `  ${name}`).join('\n')}`,
      );
    }
    return `flags: No changes in ${count}.`;
  }
  return `flags: Formatted ${changed.length} of ${count}.`;
}

interface GenerateArgs {
  readonly root: string;
  readonly command: readonly string[];
}

/**
 * Reads `[dir] [-- command ...args]`.
 */
function prepareGenerate(args: string[], allowCommand: boolean): GenerateArgs {
  const separator = args.indexOf('--');
  const options = separator === -1 ? args : args.slice(0, separator);
  const command = separator === -1 ? [] : args.slice(separator + 1);
  if (separator !== -1 && (!allowCommand || command.length === 0)) {
    throw new Error(usage);
  }
  let dir: string | undefined;
  for (const option of options) {
    if (option.startsWith('-') || dir !== undefined) {
      throw new Error(usage);
    }
    dir = option;
  }
  return { root: resolve(dir ?? '.'), command };
}

function describeAliases(root: string, aliases: FlagsAliases): string {
  const names = Object.keys(aliases);
  const flagsFiles = findFlagsFiles(root);
  if (flagsFiles.length === 0) {
    return 'flags: No flags files (*.flags) in the directory.';
  }
  const files = `${flagsFiles.length} flags ${flagsFiles.length === 1 ? 'file' : 'files'}`;
  const modules =
    names.length > 0 ? ` The sources are ${names.join(', ')}.` : '';
  return `flags: Wrote the types of ${files}.${modules}`;
}

/**
 * Writes the modules of the sources one time.
 *
 * @internal
 */
export async function sync(args: string[]): Promise<string> {
  const { root } = prepareGenerate(args, false);
  return describeAliases(root, await generateFlags(root));
}

/**
 * Writes the modules of the sources after each change of a flags file, until
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
    console.log(
      `${describeAliases(root, result.aliases)} Watching for changes.`,
    );
    if (command.length === 0) {
      await done;
      return 'flags: Stopped watching the flags files.';
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
    // The watch only ends with the signal, so the command decides the end
    const watchFailure = done.then(() => new Promise<never>(() => {}));
    process.exitCode = await Promise.race([childExit, watchFailure]);
    return 'flags: The command ended. Stopped watching the flags files.';
  } catch (error) {
    if (controller.signal.aborted) {
      return 'flags: Stopped watching the flags files.';
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

/**
 * Imports the files of the configuration of the application, as the
 * framework bindings do with `flags/config`.
 */
async function importConfig(root: string): Promise<Config> {
  const files = findConfigModules(root);
  const load = async (file: string | undefined) =>
    file === undefined
      ? undefined
      : ((await import(pathToFileURL(file).href)) as { default?: unknown })
          .default;
  const hooks = (await load(files['flags/hooks'])) as Config['hooks'];
  return {
    ...(hooks ? { hooks } : {}),
    settings: readSettings(root),
  };
}
