// Creates a key pair for the flag values of the Flags SDK: ECDH-ES with
// P-256. Writes the values of FLAG_VALUES_PUBLIC_KEY and
// FLAG_VALUES_PRIVATE_KEY into two files of the given directory, so that
// the private key does not appear in the terminal.
//
//   node scripts/generate-flag-values-keys.mjs <dir>

import { createHash, webcrypto } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/generate-flag-values-keys.mjs <dir>');
  process.exit(1);
}

const { publicKey, privateKey } = await webcrypto.subtle.generateKey(
  { name: 'ECDH', namedCurve: 'P-256' },
  true,
  ['deriveBits'],
);
const publicJwk = await webcrypto.subtle.exportKey('jwk', publicKey);
const privateJwk = await webcrypto.subtle.exportKey('jwk', privateKey);

// The JWK thumbprint (RFC 7638) as the key ID
const { crv, kty, x, y } = publicJwk;
const kid = createHash('sha256')
  .update(JSON.stringify({ crv, kty, x, y }))
  .digest('base64url');

const common = { kid, use: 'enc', alg: 'ECDH-ES' };
writeFileSync(
  join(dir, 'FLAG_VALUES_PUBLIC_KEY'),
  JSON.stringify({ kty, crv, x, y, ...common }),
);
writeFileSync(
  join(dir, 'FLAG_VALUES_PRIVATE_KEY'),
  JSON.stringify({
    ...privateJwk,
    ext: undefined,
    key_ops: undefined,
    ...common,
  }),
  { mode: 0o600 },
);
console.log(`Wrote the key pair with the key ID ${kid} to ${dir}`);
