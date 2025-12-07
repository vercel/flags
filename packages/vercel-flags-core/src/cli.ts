#!/usr/bin/env node
/*
 * Edge Config CLI
 *
 * command: prepare
 *   Reads all connected Edge Configs and emits a single stores.json file.
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
import type { BundledDefinition } from '../src/types';

// TODO replace with actual host
const host = 'localhost:3000';
// const host = "flags.vercel.com"

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

/**
 * Parses sdk keys from connection strings with the following format:
 * `flags:edgeConfigId=ecfg_abcd&edgeConfigToken=xxx&sdkKey=xxx`
 */
function parseSdkKeyFromFlagsConnectionString(text: string): string | null {
  try {
    if (!text.startsWith('flags:')) return null;
    const params = new URLSearchParams(text.slice(6));
    return params.get('sdkKey');
  } catch {
    // no-op
  }

  return null;
}

type DefinitionsJson = Record<string, BundledDefinition>;

type PrepareOptions = {
  verbose?: boolean;
};

async function prepare(output: string, options: PrepareOptions): Promise<void> {
  const sdkKeys = Array.from(
    Object.values(process.env).reduce<Set<string>>((acc, value) => {
      if (typeof value !== 'string') return acc;

      // works
      const sdkKey = parseSdkKeyFromFlagsConnectionString(value);
      if (sdkKey) acc.add(sdkKey);

      return acc;
    }, new Set<string>()),
  );

  const values: BundledDefinition[] = await Promise.all(
    sdkKeys.map<Promise<BundledDefinition>>(async (sdkKey) => {
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

      const res = await fetch(`https://${host}/datafile`, { headers });

      if (!res.ok) {
        throw new Error(
          `@vercel/flags-core: Failed to prepare definitions for ${obfuscate(sdkKey)}: ${res.status} ${res.statusText}`,
        );
      }

      const data: BundledDefinition = await res.json();
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
  .name('@vercel/edge-config')
  .description('Vercel Edge Config CLI')
  .version(version);

program
  .command('prepare')
  .description('Prepare Edge Config stores.json file for build time embedding')
  .option('--verbose', 'Enable verbose logging')
  .action(async (options: PrepareOptions) => {
    const output = join(__dirname, '..', 'dist', 'stores.json');
    await prepare(output, options);
  });

program.parse();
