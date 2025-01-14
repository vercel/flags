import { decrypt } from './crypto';
import { trace } from './tracing';

/**
 * This function lets you verify whether a request to your application's .well-known/vercel/flags endpoint was made by the toolbar.
 * You can use verifyAccess to keep this endpoint private, to avoid public access of your feature flag definitions through that endpoint.
 *
 * @example Using verifyAccess in .well-known/vercel/flags to verify access and respond with unencrypted data.
 * ```
 *  import { type NextRequest, NextResponse } from "next/server";
 *  import { verifyAccess } from "@vercel/flags";
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
 * @returns True when the authorization header was valid
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
    if (!secret)
      throw new Error(
        '@vercel/flags: verifyAccess was called without a secret. Please set FLAGS_SECRET environment variable.',
      );

    const data = await decrypt<{}>(
      authHeader?.replace(/^Bearer /i, ''),
      secret,
    );
    return data !== undefined;
  },
  {
    isVerboseTrace: false,
    name: 'verifyAccess',
  },
);
