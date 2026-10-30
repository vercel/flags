import { createRequire } from 'node:module';
import { generateFlags } from './generate.ts';

async function main() {
  const [command, ...options] = process.argv.slice(2);
  if (
    command !== 'sync' ||
    options.some((option) => option !== '--production')
  ) {
    throw new Error('Usage: flags sync [--production]');
  }
  const directory = process.cwd();
  const { loadEnvConfig } = createRequire(import.meta.url)(
    '@next/env',
  ) as typeof import('@next/env');
  loadEnvConfig(
    directory,
    !options.includes('--production') && process.env.NODE_ENV !== 'production',
  );
  await generateFlags(directory);
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Flag generation failed.',
  );
  process.exitCode = 1;
});
