import { z } from 'zod';
import { PUBLIC_ROLES } from '@/types';

/**
 * Client-side schemas. These mirror apps/backend/src/validators exactly — the
 * bounds are duplicated deliberately so the two halves can be compared in review
 * and by the tests. The server remains the authority; this is only for fast,
 * friendly feedback.
 */
export const LIMITS = {
  NAME_MIN: 2,
  NAME_MAX: 80,
  PASSWORD_MIN: 12,
  PASSWORD_MAX_BYTES: 72,
  BIO_MAX: 1000,
  LOCATION_MAX: 120,
  PHONE_MAX: 32,
  SKILL_NAME_MIN: 2,
  SKILL_NAME_MAX: 40,
  EXPERIENCE_TITLE_MAX: 120,
  EXPERIENCE_ORGANIZATION_MAX: 120,
  EXPERIENCE_DESCRIPTION_MAX: 2000,
} as const;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .email('Enter a valid email address');

const password = z
  .string()
  .min(LIMITS.PASSWORD_MIN, `Password must be at least ${LIMITS.PASSWORD_MIN} characters`)
  .refine((value) => new TextEncoder().encode(value).length <= LIMITS.PASSWORD_MAX_BYTES, {
    message: `Password must not exceed ${LIMITS.PASSWORD_MAX_BYTES} bytes`,
  });

const name = z
  .string()
  .trim()
  .min(LIMITS.NAME_MIN, `Name must be at least ${LIMITS.NAME_MIN} characters`)
  .max(LIMITS.NAME_MAX, `Name must not exceed ${LIMITS.NAME_MAX} characters`);

/**
 * `confirmPassword` exists only in the form. It is stripped before the request
 * so a redundant copy of the password is never sent or stored.
 */
export const registerFormSchema = z
  .object({
    name,
    email,
    password,
    confirmPassword: z.string().min(1, 'Confirm your password'),
    role: z.enum(PUBLIC_ROLES as unknown as [string, ...string[]], {
      errorMap: () => ({ message: 'Choose your professional role' }),
    }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export const loginFormSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

/** Empty strings become null so the API clears the field. */
const clearable = (max: number, label: string) =>
  z
    .string()
    .max(max, `${label} must not exceed ${max} characters`)
    .transform((value) => {
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    });

export const profileFormSchema = z.object({
  name,
  bio: clearable(LIMITS.BIO_MAX, 'Bio'),
  location: clearable(LIMITS.LOCATION_MAX, 'Location'),
  phone: clearable(LIMITS.PHONE_MAX, 'Phone'),
});

export const skillFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(LIMITS.SKILL_NAME_MIN, `Skill must be at least ${LIMITS.SKILL_NAME_MIN} characters`)
    .max(LIMITS.SKILL_NAME_MAX, `Skill must not exceed ${LIMITS.SKILL_NAME_MAX} characters`),
});

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker (YYYY-MM-DD)')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'That date does not exist');

export const experienceFormSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(LIMITS.EXPERIENCE_TITLE_MAX),
    organization: z
      .string()
      .trim()
      .min(1, 'Organization is required')
      .max(LIMITS.EXPERIENCE_ORGANIZATION_MAX),
    description: clearable(LIMITS.EXPERIENCE_DESCRIPTION_MAX, 'Description'),
    startDate: calendarDate,
    // An empty end date means "ongoing".
    endDate: z.union([calendarDate, z.literal('')]),
  })
  .refine((values) => values.endDate === '' || values.endDate >= values.startDate, {
    path: ['endDate'],
    message: 'End date cannot be before the start date',
  });

export type RegisterFormValues = z.input<typeof registerFormSchema>;
export type LoginFormValues = z.input<typeof loginFormSchema>;
export type ProfileFormValues = z.input<typeof profileFormSchema>;
export type SkillFormValues = z.input<typeof skillFormSchema>;
export type ExperienceFormValues = z.input<typeof experienceFormSchema>;
