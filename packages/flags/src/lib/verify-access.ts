import { verifyAccessProof } from './crypto';
import {
  FLAGS_DISCOVERY_POLICY,
  VERCEL_FLAGS_DISCOVERY_ISSUER,
} from './flags-discovery-platform';
import { trace } from './tracing';
import {
  isVercelSignedToken,
  verifyVercelSignedToken,
} from './vercel-platform';

/**
 * This function lets you verify whether a request to your application's .well-known/vercel/flags endpoint was made by the toolbar.
 * You can use verifyAccess to keep this endpoint private, to avoid public access of your feature flag definitions through that endpoint.
 *
 * It accepts a proof encrypted with the FLAGS_SECRET, and, on Vercel (or locally after `vercel env pull`),
 * a short-lived token which Vercel signs for this project and environment. The latter works without a FLAGS_SECRET.
 *
 * @example Using verifyAccess in .well-known/vercel/flags to verify access and respond with unencrypted data.
 * ```
 *  import { type NextRequest, NextResponse } from "next/server";
 *  import { verifyAccess } from "flags";
 *
 *  export async function GET(request: NextRequest) {
 *    const access = await verifyAccess(request.headers.get("Authorization"));
 *    if (!access) return NextResponse.json(null, { status: 401 });
 *
 *    return NextResponse.json({ definitions: {} })
 *  }
 * ```
 * @param authHeader the Authorization header to check
 * @param secret the FLAGS_SECRET
 * @returns True when the authorization header was valid. False for an encrypted proof when there is no secret.
 */
export const verifyAccess = trace(
  async function verifyAccess(
    // App Router returns null when a header is not defined
    // Pages Router returns undefined when a header is not defined
    // We support both so the API is slim in both cases
    authHeader: string | null | undefined,
    secret: string | undefined = process?.env?.FLAGS_SECRET,
  ) {
    if (!authHeader) return false;
    const token = authHeader.replace(/^Bearer /i, '');

    if (isVercelSignedToken(token)) {
      return Boolean(
        await verifyVercelSignedToken(
          token,
          VERCEL_FLAGS_DISCOVERY_ISSUER,
          FLAGS_DISCOVERY_POLICY,
        ),
      );
    }

    if (!secret) return false;
    return verifyAccessProof(token, secret);
  },
  {
    isVerboseTrace: false,
    name: 'verifyAccess',
  },
);
