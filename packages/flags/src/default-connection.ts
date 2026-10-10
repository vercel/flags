import {
  type Connection,
  type DefaultConnectionInput,
  defineConnection,
} from './connection';
import { createOfrepProvider } from './ofrep';
import { sharedState } from './shared-state';
import type { EvaluationContext, Provider, ResolutionDetails } from './types';

/**
 * The base URL of the OFREP endpoint of Vercel Flags.
 *
 * TEMPORARY: The endpoint does not exist yet. Replace this value with the
 * real one before publishing. `prepublishOnly` stops a publish while this
 * comment is here.
 *
 * @internal
 */
export const VERCEL_OFREP_BASE_URL = 'https://flags.vercel.com';

/**
 * The connection of flags without a connection. It uses Vercel Flags.
 */
export type DefaultConnection = Connection<
  Provider,
  'vercel',
  EvaluationContext,
  DefaultConnectionInput
>;

type FlagsCore = typeof import('@vercel/flags-core');

/**
 * How the SDK loads the optional package `@vercel/flags-core`. Only tests
 * replace it.
 *
 * @internal
 */
export const modules = {
  // A literal import in try/catch: bundlers include the package when it is
  // installed, and build without it when it is not. See the spec.
  loadFlagsCore: (): Promise<FlagsCore> => import('@vercel/flags-core'),
};

/**
 * Loads `@vercel/flags-core`. Returns `undefined` if it is not installed.
 * Other errors, e.g. of its configuration, are thrown.
 */
async function loadFlagsCore(): Promise<FlagsCore | undefined> {
  try {
    return await modules.loadFlagsCore();
  } catch (error) {
    if (isModuleNotFound(error)) return undefined;
    throw error;
  }
}

function isModuleNotFound(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return (
    code === 'ERR_MODULE_NOT_FOUND' ||
    code === 'MODULE_NOT_FOUND' ||
    /Cannot find (module|package) '@vercel\/flags-core'/.test(
      error instanceof Error ? error.message : '',
    )
  );
}

/**
 * Makes an OpenFeature provider of the client of `@vercel/flags-core`. The
 * provider of that package is not used, because it needs the package
 * `@openfeature/server-sdk`.
 */
function fromFlagsCore(core: FlagsCore): Provider {
  const client = core.flagsClient;
  return {
    metadata: { name: 'vercel' },
    initialize: async () => {
      await client.initialize();
    },
    onClose: async () => {
      await client.shutdown();
    },
    async resolveBooleanEvaluation(
      flagKey,
      defaultValue,
      context,
    ): Promise<ResolutionDetails<boolean>> {
      const result = await client.evaluate<boolean>(
        flagKey,
        defaultValue,
        context,
      );
      if (result.reason === 'error') {
        return {
          value: defaultValue,
          reason: 'ERROR',
          errorCode: result.errorCode ?? 'GENERAL',
          errorMessage: result.errorMessage,
        };
      }
      return {
        value: result.value,
        reason: result.reason === 'paused' ? 'STATIC' : 'TARGETING_MATCH',
        variant: result.variantId ?? undefined,
      };
    },
  };
}

/**
 * Selects the provider of Vercel Flags:
 *
 * 1. `@vercel/flags-core`, if it is installed. It evaluates without a request
 *    for each flag. The build of Vercel installs it, so a deployment uses it.
 * 2. OFREP with the `VERCEL_OIDC_TOKEN` of `vercel env pull`. It sends one
 *    request for each evaluation, so it is only for development.
 * 3. Otherwise, it throws.
 */
async function selectProvider(): Promise<Provider> {
  const core = await loadFlagsCore();
  if (core) return fromFlagsCore(core);

  if (process.env.VERCEL_OIDC_TOKEN) {
    return createOfrepProvider({
      name: 'vercel-ofrep',
      baseUrl: VERCEL_OFREP_BASE_URL,
      // Read for each request, because vercel env pull can renew the token
      headers: () => ({
        authorization: `Bearer ${process.env.VERCEL_OIDC_TOKEN}`,
      }),
    });
  }
  throw new Error(
    'flags: A flag without a connection uses Vercel Flags, but the project is not connected to Vercel. Run `vercel link` and `vercel env pull`, or pass a connection to defineFlag.',
  );
}

/**
 * A provider which selects its implementation on the first use. If the
 * selection fails, the next use tries again, e.g. after `vercel env pull`.
 */
function createDefaultProvider(): Provider {
  let selected: Promise<Provider> | undefined;
  const current = (): Promise<Provider> => {
    selected ??= selectProvider().catch((error: unknown) => {
      selected = undefined;
      throw error;
    });
    return selected;
  };

  return {
    metadata: { name: 'vercel' },
    async initialize(context) {
      await (await current()).initialize?.(context);
    },
    async onClose() {
      const provider = await selected?.catch(() => undefined);
      selected = undefined;
      await provider?.onClose?.();
    },
    async resolveBooleanEvaluation(flagKey, defaultValue, context, logger) {
      return (await current()).resolveBooleanEvaluation(
        flagKey,
        defaultValue,
        context,
        logger,
      );
    },
  };
}

/**
 * Returns the default connection. All copies of the package share it.
 *
 * @internal
 */
export function getDefaultConnection(): DefaultConnection {
  sharedState.defaultConnection ??= defineConnection({
    provider: createDefaultProvider(),
    project: { platform: 'vercel' },
  });
  return sharedState.defaultConnection as DefaultConnection;
}
