import type { RequestEvent } from '@sveltejs/kit';
import { base64url, compactVerify } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';

const secretA = 'a'.repeat(43);
const secretB = 'b'.repeat(43);
const secretC = 'c'.repeat(43);
const secretD = 'd'.repeat(43);

const request = new Request('https://shop.example/');

/** Loads the package with the secrets in the environment */
async function load(env: {
  FLAGS_SECRET: string;
  FLAGS_PRECOMPUTE_SECRET: string;
}) {
  vi.stubEnv('FLAGS_SECRET', env.FLAGS_SECRET);
  vi.stubEnv('FLAGS_PRECOMPUTE_SECRET', env.FLAGS_PRECOMPUTE_SECRET);
  vi.resetModules();
  const { createHandle, flag, generatePermutations, precompute } = await import(
    '.'
  );
  const flagA = flag<boolean>({ key: 'a', decide: () => true });
  const group = [flagA];

  /** Reads `code` in a page, with the secret of the handle */
  async function read(
    handle: ReturnType<typeof createHandle>,
    code: string,
  ): Promise<boolean> {
    let value: boolean | undefined;
    await handle({
      event: { request, params: {} } as unknown as RequestEvent,
      resolve: async () => {
        value = await flagA(code, group);
        return new Response();
      },
    });
    return value as boolean;
  }

  return { createHandle, generatePermutations, precompute, group, read };
}

function expectSignedWith(code: string, secret: string) {
  return expect(
    compactVerify(code, base64url.decode(secret)),
  ).resolves.toBeDefined();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each([
  { name: 'differ', FLAGS_SECRET: secretA, FLAGS_PRECOMPUTE_SECRET: secretB },
  {
    name: 'are equal',
    FLAGS_SECRET: secretA,
    FLAGS_PRECOMPUTE_SECRET: secretA,
  },
])('SvelteKit precompute when FLAGS_SECRET and FLAGS_PRECOMPUTE_SECRET $name', (env) => {
  it('uses FLAGS_PRECOMPUTE_SECRET by default, in precompute and in the handle', async () => {
    const { createHandle, generatePermutations, precompute, group, read } =
      await load(env);

    const code = await precompute(group, request);
    await expectSignedWith(code, env.FLAGS_PRECOMPUTE_SECRET);
    await expect(generatePermutations(group)).resolves.toContain(code);

    // Each request, also after the handle filled its secret with FLAGS_SECRET
    const handle = createHandle({});
    await expect(read(handle, code)).resolves.toBe(true);
    await expect(read(handle, code)).resolves.toBe(true);
  });

  it('uses a secret which is passed to precompute and generatePermutations', async () => {
    const { generatePermutations, precompute, group } = await load(env);

    // Also a secret which equals FLAGS_SECRET
    for (const secret of [env.FLAGS_SECRET, secretC]) {
      const [permutation] = await generatePermutations(group, null, secret);
      await expectSignedWith(permutation as string, secret);
      await expectSignedWith(await precompute(group, request, secret), secret);
    }
  });

  it('uses a secret which is passed to the handle', async () => {
    const { createHandle, precompute, group, read } = await load(env);

    // Also a secret which equals FLAGS_SECRET
    for (const secret of [env.FLAGS_SECRET, secretC]) {
      const handle = createHandle({ secret });
      const code = await precompute(group, request, secret);
      await expectSignedWith(code, secret);
      await expect(read(handle, code)).resolves.toBe(true);
      await expect(read(handle, code)).resolves.toBe(true);

      // A code of another secret is not valid
      const other = await precompute(group, request, secretD);
      await expect(read(handle, other)).rejects.toThrow();
    }
  });
});
