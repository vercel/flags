import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { version as PACKAGE_VERSION } from '../package.json';

const FLAGS_HOST = 'https://flags.vercel.com';
const FLAGS_DEFINITIONS_VERSION = '1.0.1';

/** Number of retry attempts for transient datafile fetch failures. */
const FETCH_MAX_RETRIES = 3;
/** Base delay in milliseconds used for exponential backoff between retries. */
const FETCH_RETRY_BASE_DELAY_MS = 200;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type BundledDefinitions = Record<string, unknown>;

export interface Output {
  debug(message: string): void;
  time<T>(label: string, promise: Promise<T>): Promise<T>;
}

export type PrepareFlagsDefinitionsResult =
  | { created: false; reason: 'no-flags-entries' }
  | { created: true; entryCount: number };

/**
 * Obfuscates SDK key for logging (shows first 18 chars)
 */
function obfuscate(sdkKey: string, prefixLength = 18): string {
  if (prefixLength >= sdkKey.length) return sdkKey;
  return (
    sdkKey.slice(0, prefixLength) + '*'.repeat(sdkKey.length - prefixLength)
  );
}

/**
 * Computes a SHA-256 hex digest of the given SDK key.
 */
export function hashSdkKey(sdkKey: string): string {
  return createHash('sha256').update(sdkKey).digest('hex');
}

export function getProjectIdFromOidcToken(oidcToken: string) {
  const tokenParts = oidcToken.split('.');
  if (tokenParts.length !== 3 || !tokenParts[1]) {
    return;
  }

  const payload = JSON.parse(
    Buffer.from(tokenParts[1], 'base64url').toString('utf8'),
  ) as { project_id?: unknown };

  if (typeof payload.project_id !== 'string' || !payload.project_id) {
    return;
  }

  return payload.project_id;
}

type DefinitionsEntry = {
  key: string;
  definitions: BundledDefinitions;
};

type MapEntry = {
  key: string;
  value: string;
};

/**
 * Creates js constants pointing to memoized deduplicated flag definitions.
 * Output format:
 * ```js
 * const _d0 = memo(() => JSON.parse('...'));
 * const _d1 = memo(() => JSON.parse('...'));
 * ````
 */
function generateDefinitionConstants(
  lines: string[],
  entries: DefinitionsEntry[],
): MapEntry[] {
  const stringToConst = new Map<string, string>();

  return entries.map((entry) => {
    const stringified = JSON.stringify(entry.definitions);
    let definitionConst = stringToConst.get(stringified);

    if (!definitionConst) {
      definitionConst = `_d${stringToConst.size}`;
      stringToConst.set(stringified, definitionConst);
      lines.push(
        `const ${definitionConst} = memo(() => JSON.parse(${JSON.stringify(stringified)}));`,
      );
    }

    return { key: entry.key, value: definitionConst };
  });
}

/**
 * Creates a js map and getter function for exposing key value pairs.
 * Output format:
 * ```js
 * const map = { "<sha256_hash_or_project_id>": _d0 };
 * export function get(key) { return map[key]?.() ?? null; }
 * ````
 */
function generateMap(lines: string[], entries: MapEntry[]): void {
  lines.push('');
  lines.push('const map = {');
  for (const entry of entries) {
    lines.push(`  ${JSON.stringify(entry.key)}: ${entry.value},`);
  }
  lines.push('};');
  lines.push('');
  lines.push('export function get(key) {');
  lines.push('  return map[key]?.() ?? null;');
  lines.push('}');
}

/**
 * Determines whether an HTTP status is worth retrying. Transient server-side
 * failures (5xx) and rate limiting (429) are retryable; other 4xx responses
 * indicate a client error that won't be fixed by retrying.
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function fetchDatafile(
  token: string,
  env: Record<string, string | undefined>,
  fetchFn: typeof globalThis.fetch,
  userAgentSuffix?: string,
  output?: Output,
): Promise<BundledDefinitions | undefined> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    'user-agent': [
      `@vercel/prepare-flags-definitions/${PACKAGE_VERSION}`,
      userAgentSuffix,
    ]
      .filter(Boolean)
      .join(' '),
  };

  // Add Vercel metadata headers if available
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

  let lastError: unknown;

  for (let attempt = 0; attempt <= FETCH_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 200ms, 400ms, 800ms, ...
      const delay = FETCH_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      output?.debug(
        `vercel-flags: retrying datafile fetch for ${obfuscate(token)} (attempt ${attempt}/${FETCH_MAX_RETRIES}) after ${delay}ms`,
      );
      await wait(delay);
    }

    let res: Response;
    try {
      res = await fetchFn(`${FLAGS_HOST}/v1/datafile`, { headers });
    } catch (error) {
      // Network-level failure (DNS, connection reset, etc.) — retryable.
      lastError = error;
      continue;
    }

    if (res.ok) {
      return res.json() as Promise<BundledDefinitions>;
    }

    if (res.status === 404) {
      return undefined;
    }

    const error = new Error(
      `Failed to fetch flag definitions for ${obfuscate(token)}: ${res.status} ${res.statusText}`,
    );

    if (!isRetryableStatus(res.status)) {
      throw error;
    }

    lastError = error;
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(
        `Failed to fetch flag definitions for ${obfuscate(token)} after ${FETCH_MAX_RETRIES} retries`,
      );
}

/**
 * Generates a JS module with deduplicated, lazily-parsed definitions.
 *
 * The map keys are SHA-256 hashes of the SDK keys so that raw keys
 * are not embedded in the output.
 *
 * Output format:
 * ```js
 * const memo = (fn) => { let cached; return () => (cached ??= fn()); };
 * const _d0 = memo(() => JSON.parse('...'));
 * const _d1 = memo(() => JSON.parse('...'));
 * const map = { "<sha256_hash>": _d0, "project_id": _d1 };
 * export function get(key) { return map[key]?.() ?? null; }
 * ```
 */
export function generateDefinitionsModule(
  entries: DefinitionsEntry[],
  output: Output | undefined,
): string {
  output?.debug(
    `vercel-flags: writing flag definitions for "${entries.map(({ key }) => obfuscate(key)).join(', ')}"`,
  );

  // generate shared js
  const lines: string[] = [
    'const memo = (fn) => { let cached; return () => (cached ??= fn()); };',
    '',
  ];

  // generate js const and capture the const names
  const generatedDefinitions = generateDefinitionConstants(lines, entries);

  // generate a map wiring keys to const names
  generateMap(lines, generatedDefinitions);

  lines.push(
    '',
    `export const version = ${JSON.stringify(FLAGS_DEFINITIONS_VERSION)};`,
  );

  return lines.join('\n');
}

type FlagEntry = {
  type: 'oidcToken' | 'sdkKey';
  key: string;
};

/**
 * Regex to match valid Vercel Flags SDK keys.
 * SDK keys must follow the format: vf_server_* or vf_client_*
 * This avoids false positives with third-party identifiers that happen
 * to start with 'vf_' (e.g., Stripe identity flow IDs like 'vf_1PyH...').
 */
const SDK_KEY_REGEX = /^vf_(?:server|client)_/;

/**
 * Collect all possible flag entries the need embedding from the environment
 */
function collectFlagEntries(
  env: Record<string, string | undefined>,
  output: Output | undefined,
): FlagEntry[] {
  const entries: FlagEntry[] = [];

  // Collect unique SDK keys from environment variables
  // Supports both direct SDK keys (vf_server_*/vf_client_*) and flags: format
  const sdkKeys = Array.from(
    Object.values(env).reduce<Set<string>>((acc, value) => {
      if (typeof value === 'string') {
        if (SDK_KEY_REGEX.test(value)) {
          acc.add(value);
        } else if (value.startsWith('flags:')) {
          const params = new URLSearchParams(value.slice('flags:'.length));
          const sdkKey = params.get('sdkKey');
          if (sdkKey && SDK_KEY_REGEX.test(sdkKey)) {
            acc.add(sdkKey);
          }
        }
      }
      return acc;
    }, new Set<string>()),
  );

  if (sdkKeys.length > 0) {
    output?.debug(`vercel-flags: found ${sdkKeys.length} SDK keys`);

    for (const key of sdkKeys) {
      entries.push({ type: 'sdkKey', key });
    }
  }

  const oidcToken = env.VERCEL_OIDC_TOKEN;
  if (oidcToken && oidcToken?.length > 0) {
    output?.debug(`vercel-flags: found OIDC token`);

    entries.push({ type: 'oidcToken', key: oidcToken });
  }

  return entries;
}

/**
 * Prepares flag definitions by reading SDK keys from environment variables,
 * fetching definitions from flags.vercel.com, and writing them into a
 * synthetic `@vercel/flags-definitions` package inside `node_modules/`.
 */
export async function prepareFlagsDefinitions(options: {
  cwd: string;
  env: Record<string, string | undefined>;
  /**
   * Appended to the user-agent header to identify the caller.
   * Example: `"vercel-cli/35.0.0"`
   */
  userAgentSuffix?: string;
  fetch?: typeof globalThis.fetch;
  output?: Output;
}): Promise<PrepareFlagsDefinitionsResult> {
  const {
    cwd,
    env,
    userAgentSuffix,
    fetch: fetchFn = globalThis.fetch,
    output,
  } = options;

  output?.debug('vercel-flags: checking env vars for SDK Keys and OIDC Token');

  const entries = collectFlagEntries(env, output);
  if (entries.length === 0) {
    return { created: false, reason: 'no-flags-entries' };
  }

  // fetch all datafiles for sdk keys and oidc tokens
  const resolvedEntries = await Promise.all(
    entries.map(async ({ key, type }) => {
      const definitions = await fetchDatafile(
        key,
        env,
        fetchFn,
        userAgentSuffix,
        output,
      );
      if (!definitions) {
        return;
      }

      if (type === 'oidcToken') {
        const projectId = getProjectIdFromOidcToken(key);

        if (projectId) {
          return {
            key: projectId,
            definitions,
          };
        }
      }

      if (type === 'sdkKey') {
        return {
          key: hashSdkKey(key),
          definitions,
        };
      }
    }),
  );

  const validEntries = resolvedEntries.filter((entry) => !!entry);

  const definitionsJs = generateDefinitionsModule(validEntries, output);

  // Write to node_modules/@vercel/flags-definitions/
  const storageDir = join(cwd, 'node_modules', '@vercel', 'flags-definitions');
  const indexPath = join(storageDir, 'index.js');
  const dtsPath = join(storageDir, 'index.d.ts');
  const packageJsonPath = join(storageDir, 'package.json');

  const dts = [
    'export function get(key: string): Record<string, unknown> | null;',
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

  output?.debug('vercel-flags: created module');
  output?.debug(`  → ${indexPath}`);
  output?.debug(`  → ${dtsPath}`);
  output?.debug(`  → ${packageJsonPath}`);

  return { created: true, entryCount: entries.length };
}
