import { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { Readable } from 'node:stream';
import type { NextApiRequestCookies } from 'next/dist/server/api-utils';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptOverrides } from '..';
import { evaluate, flag, precompute } from '.';

/**
 * These tests pin down *when* the SDK reaches for Next.js' Request-time APIs.
 *
 * Awaiting `headers()` / `cookies()` is what opts a caller out of the
 * prerender, so it is also the reason `flags/next` never needs to call
 * `await connection()` itself. See
 * https://nextjs.org/docs/app/api-reference/functions/connection.
 *
 * Two invariants are worth keeping:
 *
 * - Every App Router evaluation reads the request, including cache hits and
 *   overrides, so the surrounding render can never stay static by accident.
 * - Reading a precomputed value reads nothing, so precomputed pages stay
 *   prerenderable.
 */

const mocks = vi.hoisted(() => {
  return {
    headers: vi.fn(() => new Headers()),
    cookies: vi.fn(() => ({
      get: vi.fn(),
    })),
  };
});

vi.mock('next/headers', async (importOriginal) => {
  const mod = await importOriginal<typeof import('next/headers')>();
  return {
    ...mod,
    headers: mocks.headers,
    cookies: mocks.cookies,
  };
});

function createRequest(cookies: Record<string, string> = {}) {
  const socket = new Readable();
  const request = new IncomingMessage(
    socket as unknown as Socket,
  ) as IncomingMessage & { cookies: NextApiRequestCookies };
  request.cookies = cookies;
  request.headers.cookie = Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
  return request;
}

describe('dynamic rendering', () => {
  beforeAll(() => {
    // a random secret for testing purposes
    process.env.FLAGS_SECRET = 'yuhyxaVI0Zue85SguKlMIUQojvJyBPzm95fFYvOa4Rc';
  });

  beforeEach(() => {
    // A fresh headers instance per test, but a stable one within a test, so
    // repeated evaluations hit the per-request evaluation cache.
    const requestHeaders = new Headers();
    mocks.headers.mockReset();
    mocks.headers.mockImplementation(() => requestHeaders);
    mocks.cookies.mockReset();
    mocks.cookies.mockImplementation(() => ({ get: vi.fn() }));
  });

  describe('app router', () => {
    it('reads headers and cookies when evaluating a flag', async () => {
      const f = flag<boolean>({ key: 'read-request', decide: () => true });

      await expect(f()).resolves.toBe(true);

      expect(mocks.headers).toHaveBeenCalledTimes(1);
      expect(mocks.cookies).toHaveBeenCalledTimes(1);
    });

    it('reads headers and cookies even when the decision is not request-dependent', async () => {
      // The guarantee comes from the SDK, not from the decide function, so a
      // flag which ignores the request must still opt the caller out of the
      // prerender.
      const f = flag<number>({ key: 'no-request-usage', decide: () => 42 });

      await expect(f()).resolves.toBe(42);

      expect(mocks.headers).toHaveBeenCalledTimes(1);
      expect(mocks.cookies).toHaveBeenCalledTimes(1);
    });

    it('reads headers and cookies again when serving a cached value', async () => {
      const decide = vi.fn(() => true);
      const f = flag<boolean>({ key: 'cached', decide });

      await expect(f()).resolves.toBe(true);
      await expect(f()).resolves.toBe(true);

      // second call was served from the per-request cache …
      expect(decide).toHaveBeenCalledTimes(1);
      // … and still went through the Request-time APIs to get there
      expect(mocks.headers).toHaveBeenCalledTimes(2);
      expect(mocks.cookies).toHaveBeenCalledTimes(2);
    });

    it('reads headers and cookies when an override short-circuits the decision', async () => {
      const override = await encryptOverrides({ overridden: true });
      mocks.cookies.mockImplementation(() => ({
        get: vi.fn((cookieName: string) =>
          cookieName === 'vercel-flag-overrides'
            ? { name: 'vercel-flag-overrides', value: override }
            : undefined,
        ),
      }));
      const decide = vi.fn(() => false);
      const f = flag<boolean>({ key: 'overridden', decide });

      await expect(f()).resolves.toBe(true);

      expect(decide).not.toHaveBeenCalled();
      expect(mocks.headers).toHaveBeenCalledTimes(1);
      expect(mocks.cookies).toHaveBeenCalledTimes(1);
    });
  });

  describe('evaluate', () => {
    it('reads headers and cookies once for the whole batch', async () => {
      const a = flag<boolean>({ key: 'batch-a', decide: () => true });
      const b = flag<boolean>({ key: 'batch-b', decide: () => false });

      await expect(evaluate([a, b])).resolves.toEqual([true, false]);

      expect(mocks.headers).toHaveBeenCalledTimes(1);
      expect(mocks.cookies).toHaveBeenCalledTimes(1);
    });

    it('does not read headers or cookies for an empty batch', async () => {
      // `precompute([])` must keep working outside of a request scope, so an
      // empty batch must not force dynamic rendering either.
      await expect(evaluate([])).resolves.toEqual([]);

      expect(mocks.headers).not.toHaveBeenCalled();
      expect(mocks.cookies).not.toHaveBeenCalled();
    });

    it('does not read headers or cookies when a request is passed', async () => {
      const f = flag<boolean>({ key: 'batch-request', decide: () => true });

      await expect(evaluate([f], createRequest())).resolves.toEqual([true]);

      expect(mocks.headers).not.toHaveBeenCalled();
      expect(mocks.cookies).not.toHaveBeenCalled();
    });
  });

  describe('precomputed values', () => {
    it('does not read headers or cookies', async () => {
      const f = flag<boolean>({ key: 'precomputed', decide: () => true });
      const code = await precompute([f]);

      mocks.headers.mockClear();
      mocks.cookies.mockClear();

      await expect(f(code, [f])).resolves.toBe(true);

      // Reading a precomputed value must stay prerenderable — that is the
      // point of the precompute pattern.
      expect(mocks.headers).not.toHaveBeenCalled();
      expect(mocks.cookies).not.toHaveBeenCalled();
    });
  });

  describe('pages router', () => {
    it('does not read from next/headers', async () => {
      const f = flag<boolean>({ key: 'pages-router', decide: () => true });

      await expect(f(createRequest())).resolves.toBe(true);

      expect(mocks.headers).not.toHaveBeenCalled();
      expect(mocks.cookies).not.toHaveBeenCalled();
    });
  });
});
