import { logger } from './logger';
import { createOfrepProvider, type ProviderOfAllTypes } from './ofrep';
import type { Provider } from './types';

/**
 * The base URL of the OFREP endpoint of Vercel Flags.
 *
 * The OFREP provider appends `/ofrep/v1/...`, so the base URL has no path.
 *
 * TEMPORARY: This is a local endpoint for development of the SDK. Replace it
 * with the production endpoint before publishing. `prepublishOnly` stops a
 * publish while this comment is here.
 *
 * @internal
 */
export const VERCEL_OFREP_BASE_URL = 'http://localhost:3031';

let warnedAboutProduction = false;

/**
 * The provider of flags without a connection, when the application sets no
 * default connection.
 *
 * This module is the subpath `flags/default-provider`. The SDK imports it
 * through its own package name, so that a framework or a platform can
 * replace it with a bundler alias, e.g. with a fast provider when it builds
 * for Vercel. A replacement must export the same function.
 *
 * This implementation uses OFREP with the `VERCEL_OIDC_TOKEN` of
 * `vercel env pull`. OFREP sends one request for each evaluation, so it is
 * for development.
 */
export function createDefaultProvider(): Provider {
  let ofrep: ProviderOfAllTypes | undefined;

  function current(): ProviderOfAllTypes {
    if (!process.env.VERCEL_OIDC_TOKEN) {
      throw new Error(
        'flags: A flag without a connection uses Vercel Flags, but the project is not connected to Vercel. Run `vercel link` and `vercel env pull`, set a default connection in flags.config.ts, or pass a connection to defineFlag.',
      );
    }
    if (process.env.NODE_ENV === 'production' && !warnedAboutProduction) {
      warnedAboutProduction = true;
      logger.warn(
        'flags: Flags without a connection use OFREP, which sends one request for each evaluation. For production, set a default connection in flags.config.ts, e.g. with VercelProvider of @vercel/flags-core/openfeature.',
      );
    }
    ofrep ??= createOfrepProvider({
      name: 'vercel-ofrep',
      baseUrl: VERCEL_OFREP_BASE_URL,
      // Read for each request, because vercel env pull can renew the token
      headers: () => ({
        authorization: `Bearer ${process.env.VERCEL_OIDC_TOKEN}`,
      }),
    });
    return ofrep;
  }

  return {
    metadata: { name: 'vercel' },
    resolveBooleanEvaluation: (flagKey, defaultValue, context, logger) =>
      current().resolveBooleanEvaluation(
        flagKey,
        defaultValue,
        context,
        logger,
      ),
    resolveStringEvaluation: (flagKey, defaultValue, context, logger) =>
      current().resolveStringEvaluation(flagKey, defaultValue, context, logger),
    resolveNumberEvaluation: (flagKey, defaultValue, context, logger) =>
      current().resolveNumberEvaluation(flagKey, defaultValue, context, logger),
    resolveObjectEvaluation: (flagKey, defaultValue, context, logger) =>
      current().resolveObjectEvaluation(flagKey, defaultValue, context, logger),
  };
}

/**
 * Only for tests.
 *
 * @internal
 */
export function resetProductionWarning(): void {
  warnedAboutProduction = false;
}
