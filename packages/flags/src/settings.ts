import type { OverridesOptions } from './overrides/reader';

/**
 * The static settings of the application: `flags/config.json`. The
 * framework plugins, the CLI and the runtime read the same file, so each
 * setting has one place.
 *
 * @example
 * ```json
 * {
 *   "$schema": "https://flags-sdk.dev/schemas/config.v1.json",
 *   "selfSource": false,
 *   "overrides": { "vercel": false }
 * }
 * ```
 */
export interface Settings {
  /**
   * The default source `self`. An application which depends on
   * `@vercel/flags-core` has the source `self` with the flags of its Vercel
   * project, also without `flags/sources/self/`, and the code generation
   * loads these flags from Vercel Flags. `false` turns it off. The default
   * is `true`.
   */
  readonly selfSource?: boolean;
  /**
   * Which override tokens the SDK accepts, e.g. from Flags Explorer. By
   * default, the SDK accepts tokens of the shared secret `FLAGS_SECRET`, and
   * on Vercel the tokens which Vercel signs. See `OverridesOptions`.
   */
  readonly overrides?: OverridesOptions;
}

const KNOWN_SETTINGS = new Set(['$schema', 'selfSource', 'overrides']);

const VERCEL_OVERRIDES_OPTIONS = {
  issuer: 'string',
  jwksUrl: 'string',
  project: 'object',
  maxLifetimeSeconds: 'number',
  cacheMaxAgeMs: 'number',
  cooldownMs: 'number',
  allowInsecureLocalhost: 'boolean',
} as const;

const PROJECT_FIELDS = ['projectId', 'environment', 'teamId'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks the types of the setting `overrides`. The runtime checks the values,
 * e.g. that the issuer uses HTTPS, when it creates the verifier.
 */
function parseOverrides(value: unknown, origin: string): OverridesOptions {
  if (!isObject(value)) {
    throw new Error(`flags: overrides in ${origin} must be an object.`);
  }
  for (const key of Object.keys(value)) {
    if (key !== 'secret' && key !== 'vercel') {
      throw new Error(
        `flags: overrides in ${origin} has the unknown setting ${JSON.stringify(key)}. The settings are: secret, vercel.`,
      );
    }
  }
  const { secret, vercel } = value;
  if (typeof secret === 'string') {
    throw new Error(
      `flags: overrides.secret in ${origin} can only be false. Set the secret with the environment variable FLAGS_SECRET.`,
    );
  }
  if (secret !== undefined && secret !== false) {
    throw new Error(`flags: overrides.secret in ${origin} can only be false.`);
  }
  if (vercel !== undefined && typeof vercel !== 'boolean') {
    if (!isObject(vercel)) {
      throw new Error(
        `flags: overrides.vercel in ${origin} must be true, false or an object.`,
      );
    }
    for (const [key, option] of Object.entries(vercel)) {
      const type =
        VERCEL_OVERRIDES_OPTIONS[key as keyof typeof VERCEL_OVERRIDES_OPTIONS];
      if (type === undefined) {
        throw new Error(
          `flags: overrides.vercel in ${origin} has the unknown setting ${JSON.stringify(key)}. The settings are: ${Object.keys(VERCEL_OVERRIDES_OPTIONS).join(', ')}.`,
        );
      }
      const valid =
        type === 'object' ? isObject(option) : typeof option === type;
      if (!valid) {
        throw new Error(
          `flags: overrides.vercel.${key} in ${origin} must be of the type ${type}.`,
        );
      }
    }
    if (vercel.project !== undefined) {
      for (const [key, field] of Object.entries(
        vercel.project as Record<string, unknown>,
      )) {
        if (!PROJECT_FIELDS.includes(key) || typeof field !== 'string') {
          throw new Error(
            `flags: overrides.vercel.project in ${origin} can only have the strings ${PROJECT_FIELDS.join(', ')}.`,
          );
        }
      }
    }
  }
  return value as OverridesOptions;
}

/**
 * Checks the settings. An unknown setting or a value of the wrong type is an
 * error, so that a typo does not go unnoticed.
 *
 * @param value - The parsed content of `flags/config.json`.
 * @param origin - The file, for the error message.
 * @internal
 */
export function parseSettings(
  value: unknown,
  origin = 'flags/config.json',
): Settings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`flags: ${origin} must contain a JSON object.`);
  }
  for (const key of Object.keys(value)) {
    if (!KNOWN_SETTINGS.has(key)) {
      throw new Error(
        `flags: ${origin} has the unknown setting ${JSON.stringify(key)}. The settings are: ${[
          ...KNOWN_SETTINGS,
        ]
          .filter((name) => name !== '$schema')
          .join(', ')}.`,
      );
    }
  }
  const { selfSource, overrides } = value as {
    selfSource?: unknown;
    overrides?: unknown;
  };
  if (selfSource !== undefined && typeof selfSource !== 'boolean') {
    throw new Error(`flags: selfSource in ${origin} must be true or false.`);
  }
  return {
    ...(selfSource === undefined ? {} : { selfSource }),
    ...(overrides === undefined
      ? {}
      : { overrides: parseOverrides(overrides, origin) }),
  };
}
