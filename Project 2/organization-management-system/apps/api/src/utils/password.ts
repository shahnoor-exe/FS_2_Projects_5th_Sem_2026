import * as argon2 from 'argon2';

const ARGON2_OPTIONS: argon2.HashOptions & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB (OWASP recommended)
  timeCost: 3,       // 3 iterations
  parallelism: 4,    // 4 threads
  raw: false,
};

/**
 * Hash a plain text password using Argon2id.
 * Throws an error on failure (fails closed).
 */
export async function hashPassword(plainText: string): Promise<string> {
  try {
    return await argon2.hash(plainText, ARGON2_OPTIONS);
  } catch (error) {
    throw new Error(`Password hashing failed: ${(error as Error).message}`);
  }
}

/**
 * Verify a plain text password against an Argon2id hash.
 * Returns false on mismatch or malformed hash without throwing.
 */
export async function verifyPassword(hash: string, plainText: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainText);
  } catch {
    return false;
  }
}
