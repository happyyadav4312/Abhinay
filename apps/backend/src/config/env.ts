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

    // Filesystem root for the LOCAL media driver and for in-flight uploads.
    // Relative paths resolve from the repo root.
    STORAGE_ROOT: z.string().default('storage'),

    // Where uploaded files are kept. `cloudinary` is the default; `local` writes
    // under STORAGE_ROOT and exists for the test suites and offline work.
    MEDIA_STORAGE: z.enum(['cloudinary', 'local']).default('cloudinary'),

    // Cloudinary credentials. Blank values are allowed outside production so the
    // API still starts; uploads then answer 503 until they are filled in.
    CLOUDINARY_CLOUD_NAME: z.string().trim().default(''),
    CLOUDINARY_API_KEY: z.string().trim().default(''),
    CLOUDINARY_API_SECRET: z.string().trim().default(''),
    // Root folder in the Cloudinary media library; each kind of file gets a subfolder.
    CLOUDINARY_FOLDER: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/, 'CLOUDINARY_FOLDER must be a plain folder path')
      .default('abhinay'),

    // The time zone that decides which calendar day it is, e.g. whether a
    // casting deadline has passed. One zone for the whole platform.
    APP_TIME_ZONE: z
      .string()
      .default('Asia/Kolkata')
      .refine(
        (zone) => {
          try {
            new Intl.DateTimeFormat('en-CA', { timeZone: zone });
            return true;
          } catch {
            return false;
          }
        },
        { message: 'APP_TIME_ZONE must be an IANA time zone such as Asia/Kolkata' }
      ),

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

    // A production server that cannot store uploads should not start at all.
    if (value.NODE_ENV === 'production' && value.MEDIA_STORAGE === 'cloudinary') {
      for (const key of [
        'CLOUDINARY_CLOUD_NAME',
        'CLOUDINARY_API_KEY',
        'CLOUDINARY_API_SECRET',
      ] as const) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when MEDIA_STORAGE=cloudinary in production`,
          });
        }
      }
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
  /**
   * In-flight uploads: written here by multer, deleted when the request ends.
   * Never served over HTTP.
   */
  UPLOAD_TMP_DIR: path.resolve(REPO_ROOT, data.STORAGE_ROOT, 'tmp-uploads'),
  /** PUBLIC_SERVER_URL without a trailing slash, for safe URL concatenation. */
  PUBLIC_SERVER_URL: data.PUBLIC_SERVER_URL.replace(/\/+$/, ''),
  FRONTEND_URL: data.FRONTEND_URL.replace(/\/+$/, ''),
};

export type Env = typeof env;
