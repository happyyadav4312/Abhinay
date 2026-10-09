import { z } from 'zod';
import { CASTING_SORTS, PUBLIC_ROLES } from '@/types';

/**
 * Client-side schemas. These mirror apps/backend/src/validators exactly — the
 * bounds are duplicated deliberately so the two halves can be compared in review
 * and by the tests. The server remains the authority; this is only for fast,
 * friendly feedback.
 */
export const LIMITS = {
  NAME_MIN: 2,
  NAME_MAX: 80,
  PASSWORD_MIN: 6,
  PASSWORD_MAX_BYTES: 72,
  BIO_MAX: 1000,
  LOCATION_MAX: 120,
  PHONE_MAX: 32,
  SKILL_NAME_MIN: 2,
  SKILL_NAME_MAX: 40,
  EXPERIENCE_TITLE_MAX: 120,
  EXPERIENCE_ORGANIZATION_MAX: 120,
  EXPERIENCE_DESCRIPTION_MAX: 2000,
  CASTING_TITLE_MIN: 3,
  CASTING_TITLE_MAX: 120,
  CASTING_DESCRIPTION_MAX: 5000,
  CASTING_REQUIREMENTS_MAX: 3000,
  CASTING_COMPENSATION_MAX: 200,
  CASTING_LOCATION_MAX: 120,
  CASTING_SEARCH_MAX: 100,
  CASTING_DEADLINE_MAX_DAYS: 365,
  SHORTLIST_FOLDER_NAME_MAX: 60,
  SHORTLIST_FOLDERS_PER_ROLE_MAX: 20,
  PORTFOLIO_TITLE_MAX: 100,
  PORTFOLIO_PHOTOS_MAX: 12,
  PORTFOLIO_VIDEOS_MAX: 4,
  PORTFOLIO_LINKS_MAX: 6,
  PORTFOLIO_LINK_URL_MAX: 300,
} as const;

/**
 * Upload policies, mirroring apps/backend/src/services/media-validation.service.ts.
 * Checked in the browser only so an obvious mistake fails before a long upload;
 * the server decodes or signature-checks every file regardless.
 */
export const MEDIA_LIMITS = {
  PROFILE_PHOTO: { maxBytes: 5 * 1024 * 1024, label: '5 MB', types: ['image/jpeg', 'image/png', 'image/webp'] },
  PORTFOLIO_PHOTO: { maxBytes: 10 * 1024 * 1024, label: '10 MB', types: ['image/jpeg', 'image/png', 'image/webp'] },
  RESUME: { maxBytes: 5 * 1024 * 1024, label: '5 MB', types: ['application/pdf'] },
  REEL: { maxBytes: 100 * 1000 * 1000, label: '100 MB', types: ['video/mp4', 'video/quicktime', 'video/webm'], maxMinutes: 3 },
} as const; // prettier-ignore

/** Today's date in the browser's time zone, `YYYY-MM-DD`. The server judges by its own zone. */
export function localDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** `YYYY-MM-DD` plus whole days. */
export function addDaysTo(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

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

const requiredText = (label: string, max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must not exceed ${max} characters`);

const publicRole = (message: string) =>
  z.enum(PUBLIC_ROLES as unknown as [string, ...string[]], { errorMap: () => ({ message }) });

/**
 * Mirrors `castingRoleSchema` in apps/backend/src/validators/casting.validator.ts.
 *
 * The deadline is optional (empty = none). A *new* deadline must fall between
 * today and a year ahead; `savedDeadline` is the role's stored value on an
 * edit, which may stay as it is even after it has passed — the server applies
 * the same rule.
 */
export function castingRoleFormSchema(savedDeadline: string | null = null) {
  return z
    .object({
      title: requiredText('Title', LIMITS.CASTING_TITLE_MAX, LIMITS.CASTING_TITLE_MIN),
      seekingRole: publicRole('Choose the role you are casting for'),
      location: requiredText('Location', LIMITS.CASTING_LOCATION_MAX),
      compensation: requiredText('Compensation', LIMITS.CASTING_COMPENSATION_MAX),
      description: requiredText('Description', LIMITS.CASTING_DESCRIPTION_MAX),
      requirements: requiredText('Requirements', LIMITS.CASTING_REQUIREMENTS_MAX),
      applicationDeadline: z.union([calendarDate, z.literal('')]),
    })
    .superRefine((values, ctx) => {
      const deadline = values.applicationDeadline;
      if (!deadline || deadline === savedDeadline) return;
      const today = localDateString();
      if (deadline < today) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['applicationDeadline'],
          message: 'The deadline cannot be in the past',
        });
      } else if (deadline > addDaysTo(today, LIMITS.CASTING_DEADLINE_MAX_DAYS)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['applicationDeadline'],
          message: `The deadline must be within ${LIMITS.CASTING_DEADLINE_MAX_DAYS} days from today`,
        });
      }
    });
}

/** Mirrors `shortlistFolderSchema` in apps/backend/src/validators/shortlist.validator.ts. */
export const shortlistFolderFormSchema = z.object({
  name: requiredText('Folder name', LIMITS.SHORTLIST_FOLDER_NAME_MAX),
});

/**
 * Mirrors `canonicalInstagramUrl` in apps/backend/src/validators/profile.validator.ts:
 * an http(s) link to an Instagram reel or post. The server canonicalises it.
 */
export function isInstagramReelUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  return (
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    !url.username &&
    !url.password &&
    !url.port &&
    ['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(
      url.hostname.toLowerCase()
    ) &&
    /^\/(?:[A-Za-z0-9._]{1,30}\/)?(reel|reels|p|tv)\/[A-Za-z0-9_-]{5,40}\/?$/.test(url.pathname)
  );
}

export const portfolioLinkFormSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, 'Paste a link to an Instagram reel')
    .max(
      LIMITS.PORTFOLIO_LINK_URL_MAX,
      `Link must not exceed ${LIMITS.PORTFOLIO_LINK_URL_MAX} characters`
    )
    .refine(
      isInstagramReelUrl,
      'Paste a link to an Instagram reel, e.g. https://www.instagram.com/reel/…'
    ),
  title: z
    .string()
    .trim()
    .max(
      LIMITS.PORTFOLIO_TITLE_MAX,
      `Title must not exceed ${LIMITS.PORTFOLIO_TITLE_MAX} characters`
    ),
});

export type PortfolioLinkFormValues = z.input<typeof portfolioLinkFormSchema>;

/** An optional caption for a portfolio upload. */
export const portfolioTitleSchema = z
  .string()
  .trim()
  .max(
    LIMITS.PORTFOLIO_TITLE_MAX,
    `Title must not exceed ${LIMITS.PORTFOLIO_TITLE_MAX} characters`
  );

/** The browse filter bar. An empty value means "no filter". */
export const castingSearchFormSchema = z.object({
  q: z
    .string()
    .trim()
    .max(
      LIMITS.CASTING_SEARCH_MAX,
      `Search must not exceed ${LIMITS.CASTING_SEARCH_MAX} characters`
    ),
  seekingRole: z.union([publicRole('Choose a role'), z.literal('')]),
  location: z
    .string()
    .trim()
    .max(
      LIMITS.CASTING_LOCATION_MAX,
      `Location must not exceed ${LIMITS.CASTING_LOCATION_MAX} characters`
    ),
  deadlineBefore: z.union([calendarDate, z.literal('')]),
  sort: z.enum(CASTING_SORTS),
});

export type RegisterFormValues = z.input<typeof registerFormSchema>;
export type LoginFormValues = z.input<typeof loginFormSchema>;
export type ProfileFormValues = z.input<typeof profileFormSchema>;
export type SkillFormValues = z.input<typeof skillFormSchema>;
export type ExperienceFormValues = z.input<typeof experienceFormSchema>;
export type CastingRoleFormValues = z.input<ReturnType<typeof castingRoleFormSchema>>;
export type CastingSearchFormValues = z.input<typeof castingSearchFormSchema>;
export type ShortlistFolderFormValues = z.input<typeof shortlistFolderFormSchema>;
