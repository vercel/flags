/**
 * The provider manifest: a JSON file which a platform publishes. It tells
 * tools such as Flags Explorer how to build the links to its dashboard, from
 * the variables of a connection, e.g. the project. The flags manifest of an
 * application stores only the variables, so a platform can change its
 * links without a new build of the application.
 *
 * The schema is at https://flags-sdk.dev/schemas/provider-manifest.v1.json.
 */

/**
 * The URL templates use level 1 of RFC 6570: `{name}` placeholders, which
 * are replaced with URL-encoded values.
 */
export interface ProviderManifestLinks {
  /**
   * The page of one flag. Has the variable `flagKey`.
   */
  readonly flag?: string;
  /**
   * The page which creates a flag.
   */
  readonly createFlag?: string;
  /**
   * The page of the project.
   */
  readonly project?: string;
}

export interface ProviderManifest {
  readonly $schema?: string;
  readonly version: 1;
  /**
   * The name of the platform, e.g. `LaunchDarkly`.
   */
  readonly name: string;
  /**
   * The URL of the logo of the platform.
   */
  readonly logo?: string;
  /**
   * The variables which the connections give, with a description.
   */
  readonly variables?: Readonly<
    Record<string, { readonly description?: string }>
  >;
  readonly links: ProviderManifestLinks;
}

/**
 * The links of one flag, built from a provider manifest.
 */
export interface FlagLinks {
  readonly flag?: string;
  readonly createFlag?: string;
  readonly project?: string;
}

/**
 * Whether a value is an HTTPS URL without credentials and without a
 * fragment.
 *
 * @internal
 */
export function isSafeUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' && !url.username && !url.password && !url.hash
    );
  } catch {
    return false;
  }
}

const placeholder = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/**
 * Checks a template: an HTTPS URL, without a placeholder in its origin, so
 * that a value can not change the site of the link.
 */
function isSafeTemplate(template: unknown): template is string {
  if (typeof template !== 'string') return false;
  const origin = /^https:\/\/([^/?#]*)/.exec(template)?.[1];
  if (origin === undefined || /[{}]/.test(origin)) return false;
  return isSafeUrl(template.replace(placeholder, 'x'));
}

/**
 * Checks a provider manifest, e.g. after a fetch. Throws if it is not valid.
 */
export function validateProviderManifest(value: unknown): ProviderManifest {
  const manifest = value as Partial<ProviderManifest> | null;
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    manifest.version !== 1 ||
    typeof manifest.name !== 'string' ||
    !manifest.name.trim() ||
    typeof manifest.links !== 'object' ||
    manifest.links === null
  ) {
    throw new TypeError(
      'flags: The provider manifest is not valid. It needs version 1, a name and links.',
    );
  }
  if (manifest.logo !== undefined && !isSafeUrl(manifest.logo)) {
    throw new TypeError(
      'flags: The logo of the provider manifest must be an HTTPS URL.',
    );
  }
  for (const [name, template] of Object.entries(manifest.links)) {
    if (template !== undefined && !isSafeTemplate(template)) {
      throw new TypeError(
        `flags: The link "${name}" of the provider manifest must be an HTTPS URL, without a placeholder in its origin.`,
      );
    }
  }
  return manifest as ProviderManifest;
}

/**
 * Replaces the placeholders of a template with the URL-encoded values.
 * Returns `undefined` if a value is missing, so that a tool shows no link
 * instead of a broken one.
 */
export function expandTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
): string | undefined {
  let missing = false;
  const url = template.replace(placeholder, (_, name: string) => {
    const value = Object.hasOwn(values, name) ? values[name] : undefined;
    if (typeof value !== 'string' || value === '') {
      missing = true;
      return '';
    }
    return encodeURIComponent(value);
  });
  return missing || !isSafeUrl(url) ? undefined : url;
}

/**
 * Builds the links of a flag from a provider manifest and the variables of
 * its connection. A link whose variables are not all known is left out.
 */
export function resolveFlagLinks(
  providerManifest: ProviderManifest,
  variables: Readonly<Record<string, string>>,
  flagKey: string,
): FlagLinks {
  const manifest = validateProviderManifest(providerManifest);
  const values = { ...variables, flagKey };
  const links: Record<string, string> = {};
  for (const name of ['flag', 'createFlag', 'project'] as const) {
    const template = manifest.links[name];
    const url = template ? expandTemplate(template, values) : undefined;
    if (url) links[name] = url;
  }
  return links;
}
