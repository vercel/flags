/**
 * The static settings of the application: `flags/config.json`. The
 * framework plugins, the CLI and the runtime read the same file, so each
 * setting has one place.
 *
 * @example
 * ```json
 * {
 *   "$schema": "https://flags-sdk.dev/schemas/config.v1.json",
 *   "selfSource": false
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
}

const KNOWN_SETTINGS = new Set(['$schema', 'selfSource']);

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
  const { selfSource } = value as { selfSource?: unknown };
  if (selfSource !== undefined && typeof selfSource !== 'boolean') {
    throw new Error(`flags: selfSource in ${origin} must be true or false.`);
  }
  return selfSource === undefined ? {} : { selfSource };
}
