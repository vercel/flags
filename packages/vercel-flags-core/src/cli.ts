#!/usr/bin/env node
/*
 * Edge Config CLI
 *
 * command: prepare
 *   Reads all connected Edge Configs and emits a single definitions.json file.
 *   that can be accessed at runtime by the mockable-import function.
 *
 *   Attaches the updatedAt timestamp from the header to the emitted file, since
 *   the endpoint does not currently include it in the response body.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { version } from '../package.json';
import type { BundledDefinitions } from './types';
import { parseSdkKeyFromFlagsConnectionString } from './utils/sdk-keys';

const host = 'https://flags.vercel.com';

// Get the directory where this CLI script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Obfuscates characters after clearTextLength
 * @param sdkKey
 * @param prefixLength Number of characters to leave in clear text
 * @returns
 */
function obfuscate(sdkKey: string, prefixLength: number = 18): string {
  if (prefixLength >= sdkKey.length) return sdkKey;
  return (
    sdkKey.slice(0, prefixLength) + '*'.repeat(sdkKey.length - prefixLength)
  );
}

type DefinitionsJson = Record<string, BundledDefinitions>;

type PrepareOptions = {
  verbose?: boolean;
};

async function prepare(output: string, options: PrepareOptions): Promise<void> {
  const sdkKeys = Array.from(
    Object.values(process.env).reduce<Set<string>>((acc, value) => {
      if (typeof value !== 'string') return acc;

      // old format with `flags:` prefix
      const sdkKey = parseSdkKeyFromFlagsConnectionString(value);
      if (sdkKey) acc.add(sdkKey);

      // new format with `vf_` prefix
      if (value.startsWith('vf_')) acc.add(value);

      return acc;
    }, new Set<string>()),
  );

  const values: BundledDefinitions[] = await Promise.all(
    sdkKeys.map<Promise<BundledDefinitions>>(async (sdkKey) => {
      const headers = new Headers();
      headers.set('authorization', `Bearer ${sdkKey}`);
      headers.set('user-agent', `@vercel/flags-core@${version} (prepare)`);
      if (process.env.VERCEL_PROJECT_ID) {
        headers.set('x-vercel-project-id', process.env.VERCEL_PROJECT_ID);
      }
      if (process.env.VERCEL_ENV) {
        headers.set('x-vercel-env', process.env.VERCEL_ENV);
      }
      if (process.env.VERCEL_DEPLOYMENT_ID) {
        headers.set('x-vercel-deployment-id', process.env.VERCEL_DEPLOYMENT_ID);
      }
      if (process.env.VERCEL_REGION) {
        headers.set('x-vercel-region', process.env.VERCEL_REGION);
      }

      const res = await fetch(`${host}/v1/datafile`, { headers });

      if (!res.ok) {
        throw new Error(
          `@vercel/flags-core: Failed to prepare definitions for ${obfuscate(sdkKey)}: ${res.status} ${res.statusText}`,
        );
      }

      const data: BundledDefinitions = await res.json();
      return data;
    }),
  );

  const stores = sdkKeys.reduce<DefinitionsJson>((acc, sdkKey, index) => {
    const value = values[index];
    if (value) acc[sdkKey] = value;
    return acc;
  }, {});

  // Ensure the dist directory exists before writing
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(stores));
  if (options.verbose) {
    console.log(`vercel-flags prepare`);
    console.log(`  → created ${output}`);
    if (Object.keys(stores).length === 0) {
      console.log(`  → no definitions included`);
    } else {
      for (const key of Object.keys(stores)) {
        console.log(`  → included definitions for key "${obfuscate(key)}"`);
      }
    }
  }
}

const program = new Command();
program
  .name('@vercel/flags-core')
  .description('Vercel Flags Core CLI')
  .version(version);

program
  .command('prepare')
  .description(
    'Prepare Edge Config definitions.json file for build time embedding',
  )
  .option('--verbose', 'Enable verbose logging')
  .action(async (options: PrepareOptions) => {
    const output = join(__dirname, '..', 'dist', 'definitions.json');
    await prepare(output, options);
  });

program.parse();
