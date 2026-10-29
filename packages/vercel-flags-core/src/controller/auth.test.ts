import { getVercelOidcToken } from '@vercel/oidc';
import { describe, expect, it, vi } from 'vitest';
import { Authentication, OidcTokenError } from './auth';

vi.mock('@vercel/oidc', () => ({ getVercelOidcToken: vi.fn() }));

describe('Authentication.resolveToken', () => {
  it.each([
    "The 'x-vercel-oidc-token' header is missing from the request.\nUnable to find project root directory. Have you linked your project with `vc link?`",
    "The 'x-vercel-oidc-token' header is missing from the request.\nproject.json not found, have you linked your project with `vc link?`",
    'Expected a string-valued projectId property. Try running `vc link` to re-link your project.',
    "The 'x-vercel-oidc-token' header is missing from the request.\nNo authentication found. Please log in with the Vercel CLI (vercel login).",
    "The 'x-vercel-oidc-token' header is missing from the request.",
  ])('fails with OidcTokenError without credentials: %s', async (message) => {
    const cause = new Error(message);
    vi.mocked(getVercelOidcToken).mockRejectedValueOnce(cause);
    await expect(
      new Authentication(undefined).resolveToken(),
    ).rejects.toMatchObject({ name: 'OidcTokenError', cause });
  });

  it.each([
    "The 'x-vercel-oidc-token' header is missing from the request.\nFailed to refresh OIDC token: Internal Server Error",
    "The 'x-vercel-oidc-token' header is missing from the request.\nFailed to refresh authentication token.",
    'fetch failed',
  ])('keeps a failed token refresh retryable: %s', async (message) => {
    const cause = new Error(message);
    vi.mocked(getVercelOidcToken).mockRejectedValueOnce(cause);
    const error = await new Authentication(undefined)
      .resolveToken()
      .catch((error: unknown) => error);
    expect(error).not.toBeInstanceOf(OidcTokenError);
    expect(error).toMatchObject({
      message: expect.stringContaining(
        '@vercel/flags-core: Failed to get OIDC token.',
      ),
      cause,
    });
  });
});
