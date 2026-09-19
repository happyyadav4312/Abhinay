import { z } from 'zod';
import { Role } from '@prisma/client';
import { FieldErrors, validationFailed } from '../utils/errors';
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from '../utils/password';

/**
 * Documented field bounds. The frontend mirrors these exactly so client and
 * server validation agree.
 */
export const LIMITS = {
  NAME_MIN: 2,
  NAME_MAX: 80,
  EMAIL_MAX: 254,
  BIO_MAX: 1000,
  LOCATION_MAX: 120,
  PHONE_MAX: 32,
  SKILL_NAME_MIN: 2,
  SKILL_NAME_MAX: 40,
  SKILLS_PER_PROFILE_MAX: 30,
  EXPERIENCE_TITLE_MAX: 120,
  EXPERIENCE_ORGANIZATION_MAX: 120,
  EXPERIENCE_DESCRIPTION_MAX: 2000,
  EXPERIENCES_PER_PROFILE_MAX: 50,
  JSON_BODY_BYTES: 32 * 1024,
} as const;

/**
 * The six roles a member of the public may choose. ADMIN is deliberately absent:
 * a request that injects it fails here on the server even though the UI never
 * offers it.
 */
export const PUBLIC_ROLES = [
  Role.ACTOR,
  Role.DIRECTOR,
  Role.PRODUCER,
  Role.CAMERA_OPERATOR,
  Role.EDITOR,
  Role.OTHER_CREW,
] as const;

/** Trim + lowercase before validating, so storage and lookups always agree. */
export const emailSchema = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .max(LIMITS.EMAIL_MAX, `Email must not exceed ${LIMITS.EMAIL_MAX} characters`)
  .email('Enter a valid email address');

/**
 * Passwords are never trimmed or case-folded. The byte cap matches bcrypt's own
 * 72-byte truncation point so no part of a passphrase is silently discarded.
 */
export const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES, {
    message: `Password must not exceed ${MAX_PASSWORD_BYTES} bytes`,
  });

export const nameSchema = z
  .string({ required_error: 'Name is required' })
  .trim()
  .min(LIMITS.NAME_MIN, `Name must be at least ${LIMITS.NAME_MIN} characters`)
  .max(LIMITS.NAME_MAX, `Name must not exceed ${LIMITS.NAME_MAX} characters`);

/**
 * An optional free-text field. An empty string is treated as "clear this field"
 * and stored as NULL, so the UI does not need a separate delete affordance.
 */
export const optionalText = (max: number, label: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return null;
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    })
    .refine((value) => value === null || value.length <= max, {
      message: `${label} must not exceed ${max} characters`,
    });

/**
 * `YYYY-MM-DD` only. Parsed as UTC midnight and round-tripped to confirm the
 * date actually exists, so 2025-02-30 is rejected rather than rolling over to
 * March, and no timezone can shift the stored day.
 */
export const calendarDateSchema = z
  .string({ required_error: 'Date is required' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .transform((value, ctx) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Date is not a real calendar date' });
      return z.NEVER;
    }
    return date;
  });

/** Serialise a stored `@db.Date` back to the `YYYY-MM-DD` API contract. */
export function toCalendarDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Flatten Zod issues into `{ field: [messages] }` for the error envelope. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

/**
 * Parse with a strict allowlist schema, throwing a 422 AppError on failure.
 * Callers must use `.strict()` objects so unknown keys (role, passwordHash,
 * userId, …) are rejected rather than ignored.
 */
export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw validationFailed(toFieldErrors(result.error));
  }
  return result.data;
}

/** Route params are opaque UUID strings; anything else is a clean 404, not a 500. */
export const idParamSchema = z.string().uuid('Identifier must be a valid UUID');
