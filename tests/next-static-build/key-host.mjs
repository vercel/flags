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

const fetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url === 'https://keys.vercel-flags.com/.well-known/jwks.json') {
    return Response.json(keySet);
  }
  return fetch(input, init);
};
