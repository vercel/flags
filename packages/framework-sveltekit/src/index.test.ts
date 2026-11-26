import type { RequestEvent } from '@sveltejs/kit';
import { createAccessProof, decryptFlagValues, flag } from 'flags';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as svelteKit from '$app/server';
import { createHandle } from '.';

vi.mock('$app/server', () => ({ getRequestEvent: vi.fn() }));

const secret = 'yuhyxaVI0Zue85SguKlMIUQojvJyBPzm95fFYvOa4Rc';
const getRequestEvent = vi.mocked(svelteKit.getRequestEvent);

const summerSale = flag<boolean>({
  key: 'summer-sale',
  description: 'The summer sale',
  options: [false, true],
  decide: () => true,
});

/** Runs the handle hook for a request, with a page that evaluates flags */
async function render(
  url: string,
  page: () => Promise<void>,
  init: HeadersInit = {},
) {
  const request = new Request(url, { headers: init });
  const event = { request, url: new URL(url), params: {} } as RequestEvent;
  getRequestEvent.mockReturnValue({ request, url: event.url } as never);
  const handle = createHandle({ secret, flags: { summerSale } });
  return handle({
    event,
    resolve: async (_event, options) => {
      await page();
      const html = '<html><body><p>page</p></body></html>';
      const transformed =
        (await options?.transformPageChunk?.({ html, done: true })) ?? html;
      return new Response(transformed);
    },
  });
}

beforeEach(() => {
  vi.stubEnv('FLAGS_SECRET', '');
});

afterEach(() => {
  getRequestEvent.mockReset();
  vi.unstubAllEnvs();
});

describe('createHandle', () => {
  it('puts the values of the flags of the page into the HTML', async () => {
    const response = await render('https://shop.example/', async () => {
      await summerSale();
    });
    const html = await response.text();

    const match =
      /<script type="application\/json" data-flag-values>(.*?)<\/script><\/body>/.exec(
        html,
      );
    expect(match).not.toBeNull();
    const encrypted = JSON.parse(match?.[1] ?? '""') as string;
    await expect(decryptFlagValues(encrypted, secret)).resolves.toEqual({
      'summer-sale': true,
    });
  });

  it('leaves the HTML as it is when the page evaluated no flag', async () => {
    const response = await render('https://shop.example/', async () => {});

    expect(await response.text()).toBe('<html><body><p>page</p></body></html>');
  });

  it('serves /.well-known/vercel/flags for a valid proof', async () => {
    const proof = await createAccessProof(secret);
    const response = await render(
      'https://shop.example/.well-known/vercel/flags',
      async () => {},
      { Authorization: `Bearer ${proof}` },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      definitions: Record<string, { description?: string }>;
    };
    expect(data.definitions['summer-sale']?.description).toBe(
      'The summer sale',
    );
  });

  it('responds with 401 to /.well-known/vercel/flags without a proof', async () => {
    const response = await render(
      'https://shop.example/.well-known/vercel/flags',
      async () => {},
    );

    expect(response.status).toBe(401);
  });
});
