import type { RequestEvent } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHandle, flag, generatePermutations, precompute } from '.';

vi.hoisted(() => {
  delete process.env.FLAGS_SECRET;
});

const flagA = flag<boolean>({ key: 'a', decide: () => true });
const group = [flagA];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('SvelteKit precompute without FLAGS_SECRET', () => {
  it('signs and reads codes with the key of the deployment', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', 'key-of-deployment-a');

    const request = new Request('https://shop.example/');
    const code = await precompute(group, request);

    // the build creates the same code
    await expect(generatePermutations(group)).resolves.toContain(code);

    // a page of the same deployment reads it
    let value: boolean | undefined;
    await createHandle({ flags: { flagA } })({
      event: { request, params: {} } as unknown as RequestEvent,
      resolve: async () => {
        value = await flagA(code, group);
        return new Response();
      },
    });
    expect(value).toBe(true);
  });

  it('throws when there is no key of the deployment either', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', '');

    await expect(generatePermutations(group)).rejects.toThrow(
      'No secret provided',
    );
  });
});
