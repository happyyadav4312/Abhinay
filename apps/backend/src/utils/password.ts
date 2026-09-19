import bcrypt from 'bcrypt';
import { env } from '../config/env';

/**
 * bcrypt truncates input at 72 bytes, so the validators cap passwords there
 * rather than silently ignoring the tail of a longer passphrase.
 */
export const MAX_PASSWORD_BYTES = 72;
export const MIN_PASSWORD_LENGTH = 12;

/** Hash a plaintext password using the configured cost factor. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

/** Constant-time comparison of a plaintext password against a stored hash. */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Burn roughly the same time as a real bcrypt comparison when the account does
 * not exist, so response timing does not reveal which emails are registered.
 */
export async function fakeComparePassword(password: string): Promise<void> {
  const dummy = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.7sQ7e5cQ0wNnWJ4a6K5xqz5F0i4G3tS';
  await bcrypt.compare(password, dummy).catch(() => false);
}
