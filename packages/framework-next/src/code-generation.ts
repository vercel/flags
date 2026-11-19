/**
 * The code generation of `flags:<source>` for `withFlags`. It runs
 * `generateFlags` or `watchFlags` of `flags/tooling` before Next.js
 * compiles, and gives the aliases of the generated modules to Turbopack.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  type FlagsAliases,
  GENERATED_DIRECTORY,
  generateFlags,
  watchFlags,
} from 'flags/tooling';

/**
 * Next.js can load the configuration more than once in one process, also
 * after a reload of this module. One start for each directory and mode.
 */
const registryKey = Symbol.for('@flags-sdk/next/code-generation');
const store = globalThis as typeof globalThis & {
  [registryKey]?: Map<string, Promise<void>>;
};
store[registryKey] ??= new Map();
const starts = store[registryKey];

/**
 * Sets an environment variable also for the workers of Next.js. Next.js
 * resets the environment to its initial state before it starts a worker,
 * so the variable must also go into the initial state of `@next/env`. It
 * must be the copy of `@next/env` which the `next` of the application uses.
 */
function setForWorkers(dir: string, name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
  try {
    const fromApp = createRequire(join(dir, 'package.json'));
    const fromNext = createRequire(fromApp.resolve('next/package.json'));
    const env = fromNext('@next/env') as {
      updateInitialEnv?(values: Record<string, string | undefined>): void;
    };
    env.updateInitialEnv?.({ [name]: value });
  } catch {
    // Without @next/env, a worker generates again, which is slower but works
  }
}

/**
 * Generates the modules one time (`watch: false`, e.g. for `next build`),
 * or generates them and watches the catalogs (`watch: true`, for
 * `next dev`). Resolves when the first modules exist.
 *
 * The workers of Next.js load the configuration again. They see the PID of
 * the process which owns the generation, and do nothing while it lives.
 *
 * @internal
 */
export function prepareCodeGeneration(
  dir: string,
  watch: boolean,
): Promise<void> {
  const mode = watch ? 'watch' : 'build';
  const key = `${mode}:${dir}`;
  const ownerVariable = `__FLAGS_CODE_GENERATION_${createHash('sha256')
    .update(key)
    .digest('hex')
    .slice(0, 16)}`;
  const existing = starts.get(key);
  if (existing) {
    return existing;
  }
  const owner = Number(process.env[ownerVariable]);
  if (Number.isInteger(owner) && owner > 0) {
    try {
      // Throws if the process does not exist
      process.kill(owner, 0);
      return Promise.resolve();
    } catch {
      // A new server replaces the generation of a process which ended
      setForWorkers(dir, ownerVariable, undefined);
    }
  }

  const controller = new AbortController();
  const stop = () => controller.abort();
  const removeListeners = () => {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    process.removeListener('exit', stop);
  };
  const ready = (async () => {
    if (!watch) {
      await generateFlags(dir);
      setForWorkers(dir, ownerVariable, String(process.pid));
      return;
    }
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    process.once('exit', stop);
    try {
      const { done } = await watchFlags(dir, { signal: controller.signal });
      setForWorkers(dir, ownerVariable, String(process.pid));
      done
        .catch((error: unknown) => {
          console.error(
            'flags: The watch of the catalogs stopped. Restart next dev.',
            error,
          );
        })
        .finally(() => {
          removeListeners();
          starts.delete(key);
          setForWorkers(dir, ownerVariable, undefined);
        });
    } catch (error) {
      removeListeners();
      throw error;
    }
  })();
  starts.set(key, ready);
  ready.catch(() => starts.delete(key));
  return ready;
}

/**
 * The aliases of the generated modules, from `.flags/aliases.json`, or
 * none if the file does not exist.
 *
 * @internal
 */
export function readAliases(dir: string): FlagsAliases {
  let content: string;
  try {
    content = readFileSync(
      join(dir, GENERATED_DIRECTORY, 'aliases.json'),
      'utf8',
    );
  } catch {
    return {};
  }
  return JSON.parse(content) as FlagsAliases;
}
