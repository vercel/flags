#!/usr/bin/env node
/*
 * Vercel Flags CLI
 *
 * command: prepare
 *   Reads all connected flag definitions and emits them into
 *   node_modules/@vercel/flags-definitions/definitions.json along with a package.json
 *   that exports the definitions.json file.
 *
 *   This creates a synthetic package that can be imported by the app at runtime,
 *   providing a fallback when the flags network is unavailable.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';
import { version } from '../package.json';
import type { BundledDefinitions } from './types';
import { parseSdkKeyFromFlagsConnectionString } from './utils/sdk-keys';

const host = 'https://flags.vercel.com';

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

async function prepare(options: PrepareOptions): Promise<void> {
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

  // Determine the output directory in node_modules
  // Start from current working directory (the customer's app) and find node_modules
  const storageDir = join(
    process.cwd(),
    'node_modules',
    '@vercel',
    'flags-definitions',
  );
  const dataPath = join(storageDir, 'definitions.json');
  const pkgPath = join(storageDir, 'package.json');

  // Ensure the storage directory exists
  await mkdir(storageDir, { recursive: true });

  // Write the definitions.json file
  await writeFile(dataPath, JSON.stringify(stores));

  // Create a package.json that exports definitions.json
  const packageJson = {
    name: '@vercel/flags-definitions',
    version: '1.0.0',
    type: 'module',
    exports: {
      './definitions.json': './definitions.json',
    },
  };
  await writeFile(pkgPath, JSON.stringify(packageJson, null, 2));

  if (options.verbose) {
    console.log(`vercel-flags prepare`);
    console.log(`  → created ${dataPath}`);
    console.log(`  → created ${pkgPath}`);
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
    'Capture point-in-time snapshots of flag definitions. ' +
      'Ensures consistent values during build, enables instant bootstrapping, ' +
      'and provides fallback when the service is unavailable.',
  )
  .option('--verbose', 'Enable verbose logging')
  .action(async (options: PrepareOptions) => {
    await prepare(options);
  });

program.parse();
