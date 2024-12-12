import { jwtDecrypt, base64url, EncryptJWT } from 'jose';

export async function encryptJWT<T extends object = Record<string, unknown>>(
  payload: T,
  expirationTime: string,
  secret: string,
): Promise<string> {
  return new EncryptJWT(payload as Record<string, unknown>)
    .setExpirationTime(expirationTime)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(base64url.decode(secret));
}

export async function decryptJWT<
  T extends string | object = Record<string, unknown>,
>(
  cookie: string,
  verify: undefined | null | ((payload: T) => boolean),
  secret: string,
): Promise<T | undefined> {
  if (typeof cookie !== 'string') return;

  try {
    const { payload } = await jwtDecrypt(cookie, base64url.decode(secret));
    const decoded = payload as T;

    if (!verify || verify(decoded)) {
      // @ts-expect-error jwt field
      delete decoded.iat;
      // @ts-expect-error jwt field
      delete decoded.exp;
      return decoded;
    }
  } catch {
    // Do nothing
  }
}

/**
 * Function to encrypt overrides, values, definitions, and API data.
 */
export async function encrypt<T extends object>(
  value: T,
  secret: string | undefined = process?.env?.FLAGS_SECRET,
): Promise<string> {
  if (!secret) throw new Error('Missing FLAGS_SECRET');
  // Encapsule the data within the `c` (content) property to avoid conflicts
  // with other JWT properties like `iat` and `exp`.
  return encryptJWT({ c: value }, '1y', secret);
}

/**
 * Function to decrypt overrides, values, definitions, and API data.
 */
export async function decrypt<T extends object>(
  encryptedData: string,
  secret: string | undefined = process?.env?.FLAGS_SECRET,
): Promise<T | undefined> {
  if (!secret) throw new Error('Missing FLAGS_SECRET');
  const content = await decryptJWT<{ c: T }>(encryptedData, null, secret);
  return content?.c;
}
