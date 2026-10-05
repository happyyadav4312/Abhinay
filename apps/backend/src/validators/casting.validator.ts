import { z } from 'zod';
import {
  blankToUndefined,
  LIMITS,
  pageQuerySchema,
  pageSizeQuerySchema,
  PUBLIC_ROLES,
} from './common';

/** A required, trimmed text field with documented bounds. */
const requiredText = (label: string, max: number, min = 1) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
    .trim()
    .min(min, min === 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must not exceed ${max} characters`);

/** The profession a role is looking for. ADMIN is never a casting target. */
const seekingRoleSchema = z.enum(PUBLIC_ROLES, {
  errorMap: () => ({ message: `Seeking role must be one of: ${PUBLIC_ROLES.join(', ')}` }),
});

/**
 * POST /casting and PUT /casting/:id — the complete editable representation.
 *
 * `.strict()` turns `status`, `createdById`, `publishedAt` and friends into a
 * 422 rather than a silent no-op: status only moves through PATCH /status, and
 * ownership always comes from the access token, never from the body.
 */
export const castingRoleSchema = z
  .object({
    title: requiredText('Title', LIMITS.CASTING_TITLE_MAX, LIMITS.CASTING_TITLE_MIN),
    description: requiredText('Description', LIMITS.CASTING_DESCRIPTION_MAX),
    requirements: requiredText('Requirements', LIMITS.CASTING_REQUIREMENTS_MAX),
    compensation: requiredText('Compensation', LIMITS.CASTING_COMPENSATION_MAX),
    location: requiredText('Location', LIMITS.CASTING_LOCATION_MAX),
    seekingRole: seekingRoleSchema,
  })
  .strict();

/**
 * PATCH /casting/:id/status. DRAFT is not a valid target: a published role is
 * never un-published, it is closed.
 */
export const castingStatusSchema = z
  .object({
    status: z.enum(['OPEN', 'CLOSED'], {
      errorMap: () => ({ message: 'Status must be OPEN or CLOSED' }),
    }),
  })
  .strict();

const optionalQueryText = (label: string, max: number) =>
  z.preprocess(
    blankToUndefined,
    z
      .string({ invalid_type_error: `${label} must be a single value` })
      .trim()
      .max(max, `${label} must not exceed ${max} characters`)
      .optional()
  );

/** GET /casting — browse open roles. Unknown query keys are rejected. */
export const listCastingQuerySchema = z
  .object({
    q: optionalQueryText('Search', LIMITS.CASTING_SEARCH_MAX),
    seekingRole: z.preprocess(blankToUndefined, seekingRoleSchema.optional()),
    location: optionalQueryText('Location', LIMITS.CASTING_LOCATION_MAX),
    page: pageQuerySchema,
    pageSize: pageSizeQuerySchema,
  })
  .strict();

/** GET /casting/mine — the caller's own roles, optionally narrowed to one status. */
export const listMyCastingQuerySchema = z
  .object({
    status: z.preprocess(
      blankToUndefined,
      z
        .enum(['DRAFT', 'OPEN', 'CLOSED'], {
          errorMap: () => ({ message: 'Status must be DRAFT, OPEN or CLOSED' }),
        })
        .optional()
    ),
    page: pageQuerySchema,
    pageSize: pageSizeQuerySchema,
  })
  .strict();

export type CastingRoleInput = z.infer<typeof castingRoleSchema>;
export type CastingStatusTarget = z.infer<typeof castingStatusSchema>['status'];
export type ListCastingQuery = z.infer<typeof listCastingQuerySchema>;
export type ListMyCastingQuery = z.infer<typeof listMyCastingQuerySchema>;
