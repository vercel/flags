import { generateKeyPairSync } from 'node:crypto';

// Loaded before Next.js in each process of the build (see build.test.mjs).
// Answers the request for the public keys of Vercel, so the build needs no
// network. Next.js patches this fetch like the one of Node.js.
const keySet = {
  keys: [
    {
      ...generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({
        format: 'jwk',
      }),
      kid: 'test-key',
      use: 'enc',
      alg: 'ECDH-ES',
    },
  ],
};

// A key host which is down answers with this status (see build.test.mjs)
const status = Number(process.env.KEY_HOST_STATUS ?? 200);

const fetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url === 'https://keys.vercel-flags.com/.well-known/jwks.json') {
    return status === 200
      ? Response.json(keySet)
      : new Response(null, { status });
  }
  return fetch(input, init);
};
