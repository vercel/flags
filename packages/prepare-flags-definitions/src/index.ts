import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const FLAGS_HOST = 'https://flags.vercel.com';
const FLAGS_DEFINITIONS_VERSION = '1.0.1';

type BundledDefinitions = Record<string, unknown>;

function obfuscate(sdkKey: string, prefixLength = 18): string {
  if (prefixLength >= sdkKey.length) return sdkKey;
  return (
    sdkKey.slice(0, prefixLength) + '*'.repeat(sdkKey.length - prefixLength)
  );
}

export function hashSdkKey(sdkKey: string): string {
  return createHash('sha256').update(sdkKey).digest('hex');
}

export function generateDefinitionsModule(
  sdkKeys: string[],
  values: BundledDefinitions[],
): string {
  const stringified = sdkKeys.map((_, i) => JSON.stringify(values[i]));

  const uniqueStrings: string[] = [];
  const stringToIndex = new Map<string, number>();
  for (const s of stringified) {
    if (!stringToIndex.has(s)) {
      stringToIndex.set(s, uniqueStrings.length);
      uniqueStrings.push(s);
    }
  }

  const keyToIndex = sdkKeys.map(
    (_, i) => stringToIndex.get(stringified[i]!) ?? 0,
  );

  const hashedKeys = sdkKeys.map(hashSdkKey);

  const lines: string[] = [
    'const memo = (fn) => { let cached; return () => (cached ??= fn()); };',
    '',
  ];

  for (let i = 0; i < uniqueStrings.length; i++) {
    lines.push(
      `const _d${i} = memo(() => JSON.parse(${JSON.stringify(uniqueStrings[i])}));`,
    );
  }

  lines.push('');
  lines.push('const map = {');
  for (let i = 0; i < sdkKeys.length; i++) {
    lines.push(`  ${JSON.stringify(hashedKeys[i])}: _d${keyToIndex[i]},`);
  }
  lines.push('};');
  lines.push('');
  lines.push('export function get(hashedSdkKey) {');
  lines.push('  return map[hashedSdkKey]?.() ?? null;');
  lines.push('}');
  lines.push('');
  lines.push(
    `export const version = ${JSON.stringify(FLAGS_DEFINITIONS_VERSION)};`,
  );

  return lines.join('\n');
}

export async function prepareFlagsDefinitions(options: {
  cwd: string;
  env: Record<string, string | undefined>;
  version?: string;
  fetch?: typeof globalThis.fetch;
}): Promise<void> {
  const {
    cwd,
    env,
    version = 'unknown',
    fetch: fetchFn = globalThis.fetch,
  } = options;

  const sdkKeys = Array.from(
    Object.values(env).reduce<Set<string>>((acc, value) => {
      if (typeof value === 'string') {
        if (value.startsWith('vf_')) {
          acc.add(value);
        } else if (value.startsWith('flags:')) {
          const params = new URLSearchParams(value.slice('flags:'.length));
          const sdkKey = params.get('sdkKey');
          if (sdkKey?.startsWith('vf_')) {
            acc.add(sdkKey);
          }
        }
      }
      return acc;
    }, new Set<string>()),
  );

  if (sdkKeys.length === 0) {
    return;
  }

  const values = await Promise.all(
    sdkKeys.map(async (sdkKey) => {
      const headers: Record<string, string> = {
        authorization: `Bearer ${sdkKey}`,
        'user-agent': `prepare-flags-definitions/${version}`,
      };

      if (env.VERCEL_PROJECT_ID) {
        headers['x-vercel-project-id'] = env.VERCEL_PROJECT_ID;
      }
      if (env.VERCEL_ENV) {
        headers['x-vercel-env'] = env.VERCEL_ENV;
      }
      if (env.VERCEL_DEPLOYMENT_ID) {
        headers['x-vercel-deployment-id'] = env.VERCEL_DEPLOYMENT_ID;
      }
      if (env.VERCEL_REGION) {
        headers['x-vercel-region'] = env.VERCEL_REGION;
      }

      const res = await fetchFn(`${FLAGS_HOST}/v1/datafile`, { headers });

      if (!res.ok) {
        throw new Error(
          `Failed to fetch flag definitions for ${obfuscate(sdkKey)}: ${res.status} ${res.statusText}`,
        );
      }

      return res.json() as Promise<BundledDefinitions>;
    }),
  );

  const definitionsJs = generateDefinitionsModule(sdkKeys, values);

  const storageDir = join(cwd, 'node_modules', '@vercel', 'flags-definitions');
  const indexPath = join(storageDir, 'index.js');
  const dtsPath = join(storageDir, 'index.d.ts');
  const packageJsonPath = join(storageDir, 'package.json');

  const dts = [
    'export function get(hashedSdkKey: string): Record<string, unknown> | null;',
    'export const version: string;',
    '',
  ].join('\n');

  const packageJson = {
    name: '@vercel/flags-definitions',
    version: FLAGS_DEFINITIONS_VERSION,
    type: 'module',
    main: './index.js',
    types: './index.d.ts',
    exports: {
      '.': {
        types: './index.d.ts',
        import: './index.js',
      },
    },
  };

  await mkdir(storageDir, { recursive: true });
  await Promise.all([
    writeFile(indexPath, definitionsJs),
    writeFile(dtsPath, dts),
    writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2)),
  ]);
}
