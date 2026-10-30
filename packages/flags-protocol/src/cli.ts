import { type ChildProcess, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { generateFlags, watchFlags } from './generate.ts';

async function watch(directory: string, command: string[]) {
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
    ({ done } = await watchFlags(directory, { signal: controller.signal }));
    console.log('[flags] Watching catalogs. Press Ctrl+C to stop.');
    if (!command.length) {
      await done;
      return;
    }
    controller.signal.throwIfAborted();
    // Generated files and the manifest exist before the framework loads config.
    child = spawn(command[0]!, command.slice(1), { stdio: 'inherit' });
    childExit = new Promise<number>((resolve, reject) => {
      child!.once('error', reject);
      child!.once('exit', (code, signal) => {
        if (signal) {
          resolve(signal === 'SIGINT' ? 130 : 143);
        } else {
          resolve(code ?? 1);
        }
      });
    });
    // Finite/static catalogs may finish normally while the dev server continues.
    const watchFailure = done.then(() => new Promise<never>(() => {}));
    process.exitCode = await Promise.race([childExit, watchFailure]);
  } catch (error) {
    if (!controller.signal.aborted) {
      throw error;
    }
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

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const separator = args.indexOf('--');
  const options = separator === -1 ? args : args.slice(0, separator);
  const childCommand = separator === -1 ? [] : args.slice(separator + 1);
  if (
    (command !== 'sync' && command !== 'watch') ||
    options.some((option) => option !== '--production') ||
    (separator !== -1 && (command !== 'watch' || !childCommand.length))
  ) {
    throw new Error(
      'Usage: flags sync [--production] | flags watch [--production] [-- command ...args]',
    );
  }
  const directory = process.cwd();
  const { loadEnvConfig } = createRequire(import.meta.url)(
    '@next/env',
  ) as typeof import('@next/env');
  loadEnvConfig(
    directory,
    !options.includes('--production') && process.env.NODE_ENV !== 'production',
  );
  if (command === 'watch') {
    await watch(directory, childCommand);
  } else {
    await generateFlags(directory);
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Flag generation failed.',
  );
  process.exitCode = 1;
});
