/**
 * All JWEs created by crypto functions will typically use the same secret.
 *
 * It is vital that each decrypt function ensures the JWE was created for that
 * specific purpose, as the output of one encrypt function could otherwise be
 * used as the input to another decrypt function.
 */
import { base64url, jwtDecrypt, EncryptJWT } from 'jose';
import {
  FlagDefinitionsType,
  FlagOverridesType,
  FlagValuesType,
} from '../types';

type ExpirationTime = string | number | Date;
type PurposeClaim = 'overrides' | 'values' | 'definitions' | 'proof';
type Purpose = string | string[];

/**
 * Checks if a purpose claim matches the expected purpose.
 *
 * @param pur - The purpose claim to check, can be a string or array of strings
 * @param expectedPurpose - The expected purpose to match against
 * @returns True if the purpose matches the expected purpose, false otherwise
 */
const hasPurpose = (pur: Purpose, expectedPurpose: PurposeClaim): boolean => {
  return Array.isArray(pur)
    ? pur.includes(expectedPurpose)
    : pur === expectedPurpose;
};

/**
 * Encrypts data into a JSON Web Encryption (JWE) token.
 *
 * @param payload - The data to encrypt
 * @param secret - The encryption secret (must be a 256-bit key)
 * @param expirationTime - When the encrypted data should expire
 * @returns A promise resolving to the encrypted JWE string
 * @throws Error if the secret is invalid
 */
async function encryptJwe<T extends object = Record<string, unknown>>(
  payload: T,
  secret: string,
  expirationTime: ExpirationTime,
): Promise<string> {
  const encodedSecret = base64url.decode(secret);

  if (encodedSecret.length !== 32) {
    throw new Error(
      'flags: Invalid secret, it must be a 256-bit key (32 bytes)',
    );
  }

  return new EncryptJWT(payload as Record<string, unknown>)
    .setExpirationTime(expirationTime)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(encodedSecret);
}

/**
 * Decrypts a JWE token and verifies its contents.
 *
 * @param text - The encrypted JWE token string
 * @param verify - A function to verify the decrypted payload is valid
 * @param secret - The decryption secret (must be a 256-bit key)
 * @returns A promise resolving to the decrypted data or undefined if invalid
 * @throws Error if the secret is invalid
 */
async function decryptJwe<T extends string | object = Record<string, unknown>>(
  text: string,
  verify: (payload: T) => boolean,
  secret: string,
): Promise<T | undefined> {
  if (typeof text !== 'string') return;

  const encodedSecret = base64url.decode(secret);

  if (encodedSecret.length !== 32) {
    throw new Error(
      'flags: Invalid secret, it must be a 256-bit key (32 bytes)',
    );
  }

  try {
    const { payload } = await jwtDecrypt(text, encodedSecret);
    const decoded = payload as T;
    return verify(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Encrypts flag overrides data.
 *
 * @param overrides - The flag overrides to encrypt
 * @param secret - The encryption secret (defaults to FLAGS_SECRET env var)
 * @param expirationTime - When the encrypted data should expire (defaults to 1 year)
 * @returns A promise resolving to the encrypted JWE string
 * @throws Error if the secret is missing or invalid
 */
export async function encryptOverrides(
  overrides: FlagOverridesType,
  secret: string | undefined = process?.env?.FLAGS_SECRET,
  expirationTime: ExpirationTime = '1y',
) {
  if (!secret) throw new Error('flags: Missing FLAGS_SECRET');
  return encryptJwe({ o: overrides, pur: 'overrides' }, secret, expirationTime);
}

/**
 * Decrypts and validates flag overrides data.
 *
 * @param encryptedData - The encrypted JWE token string
 * @param secret - The decryption secret (defaults to FLAGS_SECRET env var)
 * @returns A promise resolving to the decrypted flag overrides or undefined if invalid
 * @throws Error if the secret is missing or invalid
 */
export async function decryptOverrides(
  encryptedData: string,
  secret: string | undefined = process?.env?.FLAGS_SECRET,
): Promise<FlagOverridesType | undefined> {
  if (!secret) throw new Error('flags: Missing FLAGS_SECRET');
  const contents = await decryptJwe<{
    o: FlagOverridesType;
    pur: Purpose;
  }>(
    encryptedData,
    (data) => hasPurpose(data.pur, 'overrides') && Object.hasOwn(data, 'o'),
    secret,
  );
  return contents?.o;
}

/**
 * Encrypts flag values data.
 *
 * @param flagValues - The flag values to encrypt
 * @param secret - The encryption secret (defaults to FLAGS_SECRET env var)
 * @param expirationTime - When the encrypted data should expire (defaults to 1 year)
 * @returns A promise resolving to the encrypted JWE string
 * @throws Error if the secret is missing or invalid
 */
export async function encryptFlagValues(
  flagValues: FlagValuesType,
  secret: string | undefined = process?.env?.FLAGS_SECRET,
  expirationTime: ExpirationTime = '1y',
) {
  if (!secret) throw new Error('flags: Missing FLAGS_SECRET');
  return encryptJwe({ v: flagValues, pur: 'values' }, secret, expirationTime);
}

/**
 * Decrypts and validates flag values data.
 *
 * @param encryptedData - The encrypted JWE token string
 * @param secret - The decryption secret (defaults to FLAGS_SECRET env var)
 * @returns A promise resolving to the decrypted flag values or undefined if invalid
 * @throws Error if the secret is missing or invalid
 */
export async function decryptFlagValues(
  encryptedData: string,
  secret: string | undefined = process?.env?.FLAGS_SECRET,
): Promise<FlagValuesType | undefined> {
  if (!secret) throw new Error('flags: Missing FLAGS_SECRET');
  const contents = await decryptJwe<{
    v: FlagValuesType;
    pur: Purpose;
  }>(
    encryptedData,
    (data) => hasPurpose(data.pur, 'values') && Object.hasOwn(data, 'v'),
    secret,
  );
  return contents?.v;
}

/**
 * Encrypts flag definitions data.
 *
 * @param flagDefinitions - The flag definitions to encrypt
 * @param secret - The encryption secret (defaults to FLAGS_SECRET env var)
 * @param expirationTime - When the encrypted data should expire (defaults to 1 year)
 * @returns A promise resolving to the encrypted JWE string
 * @throws Error if the secret is missing or invalid
 */
export async function encryptFlagDefinitions(
  flagDefinitions: FlagDefinitionsType,
  secret: string | undefined = process?.env?.FLAGS_SECRET,
  expirationTime: ExpirationTime = '1y',
) {
  if (!secret) throw new Error('flags: Missing FLAGS_SECRET');
  return encryptJwe(
    { d: flagDefinitions, pur: 'definitions' },
    secret,
    expirationTime,
  );
}

/**
 * Decrypts and validates flag definitions data.
 *
 * @param encryptedData - The encrypted JWE token string
 * @param secret - The decryption secret (defaults to FLAGS_SECRET env var)
 * @returns A promise resolving to the decrypted flag definitions or undefined if invalid
 * @throws Error if the secret is missing or invalid
 */
export async function decryptFlagDefinitions(
  encryptedData: string,
  secret: string | undefined = process?.env?.FLAGS_SECRET,
): Promise<FlagDefinitionsType | undefined> {
  if (!secret) throw new Error('flags: Missing FLAGS_SECRET');
  const contents = await decryptJwe<{
    d: FlagDefinitionsType;
    pur: string;
  }>(
    encryptedData,
    (data) => data.pur === 'definitions' && Object.hasOwn(data, 'd'),
    secret,
  );
  return contents?.d;
}

/**
 * Creates an access proof token.
 *
 * @param secret - The encryption secret (defaults to FLAGS_SECRET env var)
 * @param expirationTime - When the token should expire (defaults to 1 year)
 * @returns A promise resolving to the encrypted access proof token
 * @throws Error if the secret is missing or invalid
 */
export async function createAccessProof(
  secret: string | undefined = process?.env?.FLAGS_SECRET,
  expirationTime: ExpirationTime = '1y',
) {
  if (!secret) throw new Error('flags: Missing FLAGS_SECRET');
  return encryptJwe({ pur: 'proof' }, secret, expirationTime);
}

/**
 * Verifies an access proof token is valid.
 *
 * @param encryptedData - The encrypted access proof token
 * @param secret - The decryption secret (defaults to FLAGS_SECRET env var)
 * @returns A promise resolving to a boolean indicating if the token is valid
 * @throws Error if the secret is missing or invalid
 */
export async function verifyAccessProof(
  encryptedData: string,
  secret: string | undefined = process?.env?.FLAGS_SECRET,
) {
  if (!secret) throw new Error('flags: Missing FLAGS_SECRET');
  const contents = await decryptJwe<{
    pur: string;
  }>(encryptedData, (data) => hasPurpose(data.pur, 'proof'), secret);

  return Boolean(contents);
}
