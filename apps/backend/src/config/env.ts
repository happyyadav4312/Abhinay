import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Repository root, four levels up from apps/backend/src/config.
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// Only load the root .env when the variables are not already supplied by the
// caller (npm scripts use dotenv-cli, integration tests inject their own values).
dotenv.config({ path: path.join(REPO_ROOT, '.env') });

/**
 * Values that look like copy-pasted placeholders must never be accepted as real
 * signing keys, otherwise a misconfigured deployment silently signs tokens with
 * a publicly known secret.
 */
const PLACEHOLDER_PATTERN =
  /^(change[_-]?me|changeme|secret|placeholder|your[_-]?secret|replace[_-]?me|todo|xxx+)$/i;

const secret = (label: string) =>
  z
    .string()
    .min(32, `${label} must be at least 32 characters`)
    .refine((value) => !PLACEHOLDER_PATTERN.test(value.trim()), {
      message: `${label} must not be a placeholder value`,
    })
    .refine((value) => new Set(value).size > 4, {
      message: `${label} does not look random enough`,
    });

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    PORT: z.coerce.number().int().positive().default(5000),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
    JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET'),

    ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
    REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

    // bcrypt cost. 12 is a reasonable local default; tests lower it for speed.
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

    // The single browser origin allowed to make credentialed requests.
    FRONTEND_URL: z.string().url().default('http://localhost:3000'),

    // Absolute base URL of this API, used to build image URLs. Never derived
    // from the request Host header.
    PUBLIC_SERVER_URL: z.string().url().default('http://localhost:5000'),

    // Filesystem root for uploaded media. Relative paths resolve from the repo root.
    STORAGE_ROOT: z.string().default('storage'),

    // Auth throttling. Generous by default; integration tests raise it further.
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(50),
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60 * 1000),
  })
  .superRefine((value, ctx) => {
    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET must be different from JWT_ACCESS_SECRET',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Field names only — never the offending values, which are secrets.
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error('Environment validation failed. See the errors above and fix your .env file.');
}

const data = parsed.data;

export const env = {
  ...data,
  /** Absolute, normalised filesystem root that all uploads must stay inside. */
  STORAGE_ROOT_ABSOLUTE: path.resolve(REPO_ROOT, data.STORAGE_ROOT),
  /** PUBLIC_SERVER_URL without a trailing slash, for safe URL concatenation. */
  PUBLIC_SERVER_URL: data.PUBLIC_SERVER_URL.replace(/\/+$/, ''),
  FRONTEND_URL: data.FRONTEND_URL.replace(/\/+$/, ''),
};

export type Env = typeof env;
