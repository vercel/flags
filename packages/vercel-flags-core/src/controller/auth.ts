import { getVercelOidcToken } from '@vercel/oidc';
import { parseSdkKeyFromFlagsConnectionString } from '../utils/sdk-keys';

export type BundledDefinitionsLookup =
  | { type: 'sdk-key'; sdkKey: string }
  | { type: 'project-id'; projectId: string };

/**
 * Names the project whose flags are read when it is not the project the OIDC
 * token belongs to. Only sent together with an OIDC token.
 */
export const SOURCE_PROJECT_HEADER = 'X-Vercel-Flags-Project-Id';

export interface Auth {
  sdkKey?: string;
  /** Set when reading another project's flags with this deployment's OIDC token. */
  sourceProjectId?: string;
  resolveToken(): Promise<string>;
  resolveBundledDefinitionsLookup(): Promise<BundledDefinitionsLookup>;
  /** Returns the lookup when it is known without resolving a token. */
  getStaticBundledDefinitionsLookup(): BundledDefinitionsLookup | undefined;
}

export function authHeaders(
  token: string,
  sourceProjectId?: string,
): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    ...(sourceProjectId ? { [SOURCE_PROJECT_HEADER]: sourceProjectId } : null),
  };
}

export function unauthorizedMessage(sourceProjectId?: string): string {
  if (!sourceProjectId) {
    return 'unauthorized (401)';
  }
  return `unauthorized (401): this deployment is not allowed to read the flags of project "${sourceProjectId}". Check that the project is connected. See https://vercel.com/docs/flags/vercel-flags/project-connections`;
}

/** No OIDC token is available, so requests cannot authenticate. */
export class OidcTokenError extends Error {
  constructor(cause: unknown) {
    super(
      [
        '@vercel/flags-core: Failed to get OIDC token.',
        'Are you running in a Vercel Environment where OIDC tokens are available?',
        'Did you mean to use an SDK Key instead? Use the environment variable FLAGS or pass it directly to the client.',
      ].join(' '),
      { cause },
    );
    this.name = 'OidcTokenError';
  }
}

async function getOidcToken(): Promise<string> {
  try {
    return await getVercelOidcToken();
  } catch (error) {
    throw new OidcTokenError(error);
  }
}

function getProjectIdFromOidcToken(oidcToken: string): string {
  const tokenParts = oidcToken.split('.');
  if (tokenParts.length !== 3 || !tokenParts[1]) {
    throw new Error('@vercel/flags-core: Invalid OIDC token');
  }

  const payload = JSON.parse(
    Buffer.from(tokenParts[1], 'base64url').toString('utf8'),
  ) as { project_id?: unknown };

  if (typeof payload.project_id !== 'string' || !payload.project_id) {
    throw new Error(
      '@vercel/flags-core: Missing project_id claim in OIDC token',
    );
  }

  return payload.project_id;
}

export class Authentication implements Auth {
  public readonly sdkKey?: string;
  public readonly sourceProjectId?: string;

  constructor(sdkKeyOrConnectionString: string | undefined) {
    // validate sdk key format
    if (sdkKeyOrConnectionString !== undefined) {
      if (typeof sdkKeyOrConnectionString !== 'string') {
        throw new Error(
          `@vercel/flags-core: Invalid sdkKey. Expected string, got ${typeof sdkKeyOrConnectionString}`,
        );
      }

      // Parse connection string if needed (e.g., "flags:edgeConfigId=...&sdkKey=vf_xxx")
      const parsed = parseSdkKeyFromFlagsConnectionString(
        sdkKeyOrConnectionString,
      );
      if (!parsed) {
        throw new Error('@vercel/flags-core: Missing sdkKey');
      }

      this.sdkKey = parsed;
    }
  }

  public async resolveToken() {
    if (this.sdkKey) {
      return this.sdkKey;
    }

    return await getOidcToken();
  }

  public getStaticBundledDefinitionsLookup():
    | BundledDefinitionsLookup
    | undefined {
    if (this.sdkKey) {
      return { type: 'sdk-key', sdkKey: this.sdkKey };
    }

    if (this.sourceProjectId) {
      return { type: 'project-id', projectId: this.sourceProjectId };
    }

    // The OIDC token belongs to the deployment's own project.
    const projectId = process.env.VERCEL_PROJECT_ID;
    if (projectId) {
      return { type: 'project-id', projectId };
    }

    return undefined;
  }

  public async resolveBundledDefinitionsLookup(): Promise<BundledDefinitionsLookup> {
    const lookup = this.getStaticBundledDefinitionsLookup();
    if (lookup) {
      return lookup;
    }

    const oidcToken = await this.resolveToken();
    return {
      type: 'project-id',
      projectId: getProjectIdFromOidcToken(oidcToken),
    };
  }
}
