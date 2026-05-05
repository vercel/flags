import { getVercelOidcToken } from '@vercel/oidc';
import { parseSdkKeyFromFlagsConnectionString } from '../utils/sdk-keys';

export type BundledDefinitionsLookup =
  | { type: 'sdk-key'; sdkKey: string }
  | { type: 'project-id'; projectId: string };

export interface Auth {
  sdkKey?: string;
  resolveToken(): Promise<string>;
  resolveBundledDefinitionsLookup(): Promise<BundledDefinitionsLookup>;
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

  constructor(sdkKeyOrConnectionString?: string) {
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

    return await getVercelOidcToken();
  }

  public async resolveBundledDefinitionsLookup(): Promise<BundledDefinitionsLookup> {
    if (this.sdkKey) {
      return { type: 'sdk-key', sdkKey: this.sdkKey };
    }

    const oidcToken = await this.resolveToken();
    return {
      type: 'project-id',
      projectId: getProjectIdFromOidcToken(oidcToken),
    };
  }
}
