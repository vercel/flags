/**
 * The catalog of Vercel Flags for the code generation of the Flags SDK, at
 * `@vercel/flags-core/catalog`. It runs in Node.js at build time and in
 * development, not in the application.
 *
 * @example
 * ```ts
 * // flags/sources/self/catalog.ts
 * export { default } from '@vercel/flags-core/catalog';
 * ```
 *
 * The types are the same shape as `Catalog` and `CatalogLoader` of `flags`,
 * so that this package does not depend on `flags`.
 */
import { Authentication } from './controller/auth';
import { connectStream } from './controller/stream-connection';
import type { DatafileInput } from './types';

const DEFAULT_HOST = 'https://flags.vercel.com';

/** A flag of the catalog: the `CatalogFlag` of `flags`. */
export interface VercelCatalogFlag {
  readonly variants: readonly unknown[];
  readonly description?: string;
}

/** A catalog of Vercel Flags: the `Catalog` of `flags`. */
export interface VercelCatalog {
  readonly project: {
    readonly system: 'vercel-flags';
    readonly projectId: string;
  };
  readonly revision?: number;
  readonly flags: Readonly<Record<string, VercelCatalogFlag>>;
}

/** The `CatalogLoader` of `flags`. */
export type VercelCatalogLoader = (options: {
  readonly signal: AbortSignal;
}) => AsyncIterable<VercelCatalog>;

export interface VercelCatalogOptions {
  /**
   * The SDK key, or a connection string of Vercel Flags. The default is the
   * environment variable `FLAGS`. Without both, the loader uses the OIDC
   * token of the project, e.g. after `vercel env pull`.
   */
  readonly sdkKey?: string;
  /**
   * Reads the flags of another project of the same team, with the OIDC token
   * of this project. The other project needs a connection to this project.
   * Not together with an SDK key.
   */
  readonly projectId?: string;
  /**
   * The `fetch` for the stream, e.g. in tests.
   */
  readonly fetch?: typeof globalThis.fetch;
  /**
   * The host of the API of Vercel Flags.
   *
   * @internal
   */
  readonly host?: string;
}

/**
 * Turns a datafile of Vercel Flags into a catalog: the variants and the
 * description of each flag, the project for the links of Flags Explorer,
 * and the revision.
 */
export function catalogFromDatafile(datafile: DatafileInput): VercelCatalog {
  if (!datafile.projectId || !datafile.definitions) {
    throw new Error(
      '@vercel/flags-core: The datafile has no projectId or no definitions.',
    );
  }
  const flags: Record<string, VercelCatalogFlag> = {};
  for (const [key, definition] of Object.entries(datafile.definitions)) {
    if (!Array.isArray(definition.variants)) {
      throw new Error(
        `@vercel/flags-core: The flag ${JSON.stringify(key)} has no variants.`,
      );
    }
    const { description } = definition;
    flags[key] = {
      variants: definition.variants,
      ...(description ? { description } : {}),
    };
  }
  return {
    project: { system: 'vercel-flags', projectId: datafile.projectId },
    ...(typeof datafile.revision === 'number'
      ? { revision: datafile.revision }
      : {}),
    flags,
  };
}

type Item =
  | { readonly type: 'datafile'; readonly datafile: DatafileInput }
  | { readonly type: 'error'; readonly error: unknown }
  | { readonly type: 'end' };

/**
 * Creates a catalog loader for Vercel Flags. It yields the catalog of the
 * current datafile first, and again after each change, until the signal
 * aborts. A build takes the first catalog only.
 */
export function createCatalogLoader(
  options: VercelCatalogOptions = {},
): VercelCatalogLoader {
  return (loadOptions) => streamCatalogs(options, loadOptions.signal);
}

async function* streamCatalogs(
  options: VercelCatalogOptions,
  signal: AbortSignal,
): AsyncGenerator<VercelCatalog> {
  // Read when the catalog loads, after the SDK loads the .env files
  const auth = new Authentication(
    options.projectId === undefined
      ? (options.sdkKey ?? process.env.FLAGS)
      : options.sdkKey,
    { projectId: options.projectId },
  );
  const queue: Item[] = [];
  let wake: (() => void) | undefined;
  const push = (item: Item) => {
    queue.push(item);
    wake?.();
  };

  const abortController = new AbortController();
  const stop = () => abortController.abort(signal.reason);
  signal.addEventListener('abort', stop, { once: true });
  abortController.signal.addEventListener(
    'abort',
    () => {
      if (signal.aborted) {
        push({ type: 'end' });
        return;
      }
      // The stream stopped itself: a 401, or no retries left
      const reason: unknown = abortController.signal.reason;
      push({
        type: 'error',
        error:
          reason instanceof Error && reason.name !== 'AbortError'
            ? reason
            : new Error(
                '@vercel/flags-core: The catalog stream of Vercel Flags stopped.',
                { cause: reason },
              ),
      });
    },
    { once: true },
  );
  if (signal.aborted) {
    stop();
  }

  connectStream(
    {
      clientName: 'flags-catalog',
      host: options.host ?? DEFAULT_HOST,
      abortController,
      fetch: options.fetch,
      resolveToken: () => auth.resolveToken(),
      sourceProjectId: auth.sourceProjectId,
    },
    {
      onDatafile: (datafile) => push({ type: 'datafile', datafile }),
    },
  ).catch((error: unknown) => push({ type: 'error', error }));

  let previous: DatafileInput | undefined;
  try {
    while (true) {
      const item = queue.shift();
      if (!item) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = undefined;
        continue;
      }
      if (item.type === 'end') {
        return;
      }
      if (item.type === 'error') {
        throw item.error;
      }
      const { datafile } = item;
      // A reconnect sends the whole datafile again
      const unchanged =
        previous?.projectId === datafile.projectId &&
        previous?.environment === datafile.environment &&
        typeof previous?.revision === 'number' &&
        typeof datafile.revision === 'number' &&
        datafile.revision <= previous.revision;
      if (!unchanged) {
        previous = datafile;
        yield catalogFromDatafile(datafile);
      }
    }
  } finally {
    signal.removeEventListener('abort', stop);
    abortController.abort();
  }
}

/**
 * The catalog of the flags of this project, with the SDK key of `FLAGS` or
 * the OIDC token. The default export, for `catalog.ts`.
 */
export const loadCatalog: VercelCatalogLoader = (loadOptions) =>
  streamCatalogs({}, loadOptions.signal);

export default loadCatalog;
