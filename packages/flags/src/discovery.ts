/**
 * The Flags Discovery Endpoint, `/.well-known/vercel/flags`, which Flags
 * Explorer queries today to find the flags of an application. This module
 * is the subpath `flags/discovery`. It works with each framework, because
 * the handler takes a Web `Request` and returns a `Response`.
 *
 * This endpoint is transitional: it will go away when Flags Explorer reads
 * the flags manifest. The format is the format of v4 (`ApiData`).
 *
 * @example
 * ```ts
 * // app/.well-known/vercel/flags/route.ts (Next.js)
 * import { createFlagsDiscoveryEndpoint, getProviderData } from 'flags/discovery';
 * import * as flags from '../../../../flags';
 *
 * export const GET = createFlagsDiscoveryEndpoint(() => getProviderData(flags));
 * ```
 */
import { EncryptJWT, jwtDecrypt } from 'jose';
import { version } from '../package.json';
import { createManifest } from './manifest';
import { decodeSecret } from './overrides/shared-secret';
import type { JsonValue } from './overrides/types';

/**
 * An option of a flag, as Flags Explorer shows it.
 */
export interface FlagOptionType {
  value: JsonValue;
  label?: string;
}

/**
 * What Flags Explorer knows about one flag.
 */
export interface FlagDefinitionType {
  options?: FlagOptionType[];
  /**
   * The URL where the flag can be managed.
   */
  origin?: string;
  description?: string;
  /**
   * `true` when the flag is declared in the code of the application.
   */
  declaredInCode?: boolean;
  /**
   * The default value of the code, which is used when the evaluation fails.
   */
  defaultValue?: JsonValue;
}

/**
 * The response of the Flags Discovery Endpoint.
 */
export interface ApiData {
  definitions?: Record<string, FlagDefinitionType>;
  /**
   * Shown in Flags Explorer, e.g. when the data of a provider could not be
   * loaded.
   */
  hints?: { key: string; text: string }[];
  /**
   * How Flags Explorer stores overrides: `encrypted` with the
   * `FLAGS_SECRET`, or `plaintext`.
   */
  overrideEncryptionMode?: 'encrypted' | 'plaintext';
}

/**
 * Creates the definitions of Flags Explorer from the exports of one or more
 * modules which only export flags, e.g. modules with `'use flags'`, or the
 * generated modules of `flags:<source>`.
 *
 * @example
 * ```ts
 * import * as flags from './flags';
 *
 * const data = getProviderData(flags);
 * ```
 */
export function getProviderData(
  ...modules: readonly Record<string, unknown>[]
): ApiData {
  const manifest = createManifest(
    modules.map((exports, index) => ({
      id: `module-${index}`,
      exports: { ...exports },
    })),
  );
  const definitions: Record<string, FlagDefinitionType> = {};
  for (const [key, definition] of Object.entries(manifest.definitions)) {
    definitions[key] = {
      declaredInCode: true,
      ...(definition.options
        ? {
            options: definition.options.map((option) => ({
              value: option.value as JsonValue,
              ...(option.label !== undefined ? { label: option.label } : {}),
            })),
          }
        : {}),
      ...(definition.description !== undefined
        ? { description: definition.description }
        : {}),
      ...(definition.defaultValue !== undefined
        ? { defaultValue: definition.defaultValue as JsonValue }
        : {}),
    };
  }
  return { definitions, hints: [] };
}

/**
 * Creates an access proof with the shared secret, as Flags Explorer does.
 * Use it in tests, to call the endpoint.
 *
 * The format is the format of v4: a JWE with direct encryption (A256GCM)
 * and the purpose `proof`.
 *
 * @param secret - The default is the environment variable `FLAGS_SECRET`.
 */
export async function createAccessProof(
  secret: string | undefined = process.env.FLAGS_SECRET,
  expirationTime: string | number | Date = '1y',
): Promise<string> {
  if (!secret) {
    throw new Error('flags: Missing FLAGS_SECRET.');
  }
  return new EncryptJWT({ pur: 'proof' })
    .setExpirationTime(expirationTime)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(decodeSecret(secret));
}

/**
 * Returns whether the `Authorization` header of a request has a valid
 * access proof of Flags Explorer. Use it to keep the definitions of the
 * flags private.
 *
 * @param secret - The default is the environment variable `FLAGS_SECRET`.
 * Throws if it is missing.
 */
export async function verifyAccess(
  authorization: string | null | undefined,
  secret: string | undefined = process.env.FLAGS_SECRET,
): Promise<boolean> {
  if (!authorization) {
    return false;
  }
  if (!secret) {
    throw new Error(
      'flags: verifyAccess needs a secret. Set the environment variable FLAGS_SECRET.',
    );
  }
  // An invalid secret throws, so that it is not hidden as a denied access
  const key = decodeSecret(secret);
  try {
    const { payload } = await jwtDecrypt(
      authorization.replace(/^Bearer /i, ''),
      key,
      {
        keyManagementAlgorithms: ['dir'],
        contentEncryptionAlgorithms: ['A256GCM'],
      },
    );
    const purpose = payload.pur;
    if (Array.isArray(purpose)) {
      return purpose.includes('proof');
    }
    return purpose === 'proof';
  } catch {
    return false;
  }
}

/**
 * Creates the handler of the Flags Discovery Endpoint. It returns 401
 * without a valid access proof of Flags Explorer, and else the data of
 * `getApiData`.
 *
 * @param getApiData - Returns the data, e.g. with `getProviderData`.
 * @param options.secret - The default is the environment variable
 * `FLAGS_SECRET`.
 */
export function createFlagsDiscoveryEndpoint(
  getApiData: (request: Request) => ApiData | Promise<ApiData>,
  options?: { secret?: string },
): (request: Request) => Promise<Response> {
  return async (request) => {
    const access = await verifyAccess(
      request.headers.get('authorization'),
      options?.secret,
    );
    if (!access) {
      return Response.json(null, { status: 401 });
    }
    const data = await getApiData(request);
    return new Response(JSON.stringify(data), {
      headers: {
        'x-flags-sdk-version': version,
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    });
  };
}
