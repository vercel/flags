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
  vi.restoreAllMocks();
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

  it('prefers FLAGS_PRECOMPUTE_SECRET in precompute and in the handle', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', 'key-of-deployment-a');
    const request = new Request('https://shop.example/');
    const withDeploymentKey = await precompute(group, request);

    vi.stubEnv('FLAGS_PRECOMPUTE_SECRET', 'b'.repeat(43));
    const code = await precompute(group, request);
    expect(code).not.toBe(withDeploymentKey);
    await expect(generatePermutations(group)).resolves.toContain(code);

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

  it('signs and reads codes with a public secret outside of Vercel', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', '');
    vi.stubEnv('VERCEL', '');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const request = new Request('https://shop.example/');
    const code = await precompute(group, request);
    await expect(generatePermutations(group)).resolves.toContain(code);

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

  it('throws on Vercel when there is no key of the deployment either', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_KEY', '');
    vi.stubEnv('VERCEL', '1');

    await expect(generatePermutations(group)).rejects.toThrow(
      'No secret provided',
    );
  });
});
