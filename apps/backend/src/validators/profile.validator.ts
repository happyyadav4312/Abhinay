import { z } from 'zod';
import { calendarDateSchema, LIMITS, nameSchema, optionalText } from './common';

/**
 * PUT /profile/me — the complete editable scalar representation.
 * Explicit `null` (or an empty string) clears an optional field.
 *
 * Note what is absent: email, role, profileImage, skills, experiences, userId,
 * id. `.strict()` turns any attempt to set them into a 422 rather than a silent
 * no-op, which is what makes the privilege-escalation tests meaningful.
 */
export const updateProfileSchema = z
  .object({
    name: nameSchema,
    bio: optionalText(LIMITS.BIO_MAX, 'Bio'),
    location: optionalText(LIMITS.LOCATION_MAX, 'Location'),
    phone: optionalText(LIMITS.PHONE_MAX, 'Phone'),
  })
  .strict();

export const addSkillSchema = z
  .object({
    name: z
      .string({ required_error: 'Skill name is required' })
      .trim()
      .min(LIMITS.SKILL_NAME_MIN, `Skill must be at least ${LIMITS.SKILL_NAME_MIN} characters`)
      .max(LIMITS.SKILL_NAME_MAX, `Skill must not exceed ${LIMITS.SKILL_NAME_MAX} characters`)
      .regex(
        /^[\p{L}\p{N}][\p{L}\p{N} .,'&+/#-]*$/u,
        "Skill may only contain letters, numbers, spaces and . , ' & + / # -"
      ),
  })
  .strict();

const experienceShape = {
  title: z
    .string({ required_error: 'Title is required' })
    .trim()
    .min(1, 'Title is required')
    .max(
      LIMITS.EXPERIENCE_TITLE_MAX,
      `Title must not exceed ${LIMITS.EXPERIENCE_TITLE_MAX} characters`
    ),
  organization: z
    .string({ required_error: 'Organization is required' })
    .trim()
    .min(1, 'Organization is required')
    .max(
      LIMITS.EXPERIENCE_ORGANIZATION_MAX,
      `Organization must not exceed ${LIMITS.EXPERIENCE_ORGANIZATION_MAX} characters`
    ),
  description: optionalText(LIMITS.EXPERIENCE_DESCRIPTION_MAX, 'Description'),
  startDate: calendarDateSchema,
  // Null means the engagement is ongoing.
  endDate: z.union([calendarDateSchema, z.null()]).optional().default(null),
};

/** Shared rule: an engagement cannot end before it started. */
const chronological = <T extends { startDate: Date; endDate: Date | null }>(
  value: T,
  ctx: z.RefinementCtx
) => {
  if (value.endDate && value.endDate.getTime() < value.startDate.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: 'End date cannot be before the start date',
    });
  }
};

export const createExperienceSchema = z.object(experienceShape).strict().superRefine(chronological);
export const updateExperienceSchema = z.object(experienceShape).strict().superRefine(chronological);

/**
 * The text fields sent alongside a portfolio upload (multipart). Only an
 * optional caption; anything else in the form is rejected.
 */
export const portfolioUploadFieldsSchema = z
  .object({
    title: optionalText(LIMITS.PORTFOLIO_TITLE_MAX, 'Title'),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type AddSkillInput = z.infer<typeof addSkillSchema>;
export type CreateExperienceInput = z.infer<typeof createExperienceSchema>;
export type UpdateExperienceInput = z.infer<typeof updateExperienceSchema>;

/**
 * Canonical skill identity: trimmed, whitespace-collapsed, lowercased.
 * "Method Acting", "method  acting" and " METHOD ACTING " all resolve to the
 * same Skill row while the first-seen display casing is preserved.
 */
export function normalizeSkillName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}
