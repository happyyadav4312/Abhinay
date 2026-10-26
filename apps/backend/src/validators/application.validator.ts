import { z } from 'zod';
import { blankToUndefined, pageQuerySchema, pageSizeQuerySchema } from './common';

/**
 * POST /casting/:id/applications carries no body: who applies always comes from
 * the access token. `.strict()` turns an injected `applicantId` or `status`
 * into a 422 instead of silently ignoring it.
 */
export const applySchema = z.object({}).strict();

/** The four statuses agreed in Lab 2, in lifecycle order. */
export const APPLICATION_STATUSES = ['APPLIED', 'SHORTLISTED', 'SELECTED', 'REJECTED'] as const;

/** GET /applications/mine — the caller's applications, optionally by status. */
export const listMyApplicationsQuerySchema = z
  .object({
    status: z.preprocess(
      blankToUndefined,
      z
        .enum(APPLICATION_STATUSES, {
          errorMap: () => ({
            message: `Status must be one of: ${APPLICATION_STATUSES.join(', ')}`,
          }),
        })
        .optional()
    ),
    page: pageQuerySchema,
    pageSize: pageSizeQuerySchema,
  })
  .strict();

export type ListMyApplicationsQuery = z.infer<typeof listMyApplicationsQuerySchema>;

/**
 * The statuses a role author may move an application TO. APPLIED is the
 * system-assigned initial status and is never a valid target.
 */
export const APPLICATION_STATUS_TARGETS = ['SHORTLISTED', 'SELECTED', 'REJECTED'] as const;
export type ApplicationStatusTarget = (typeof APPLICATION_STATUS_TARGETS)[number];

/** PATCH /casting/:id/applications/:applicationId/status */
export const updateApplicationStatusSchema = z
  .object({
    status: z.enum(APPLICATION_STATUS_TARGETS, {
      errorMap: () => ({
        message: `Status must be one of: ${APPLICATION_STATUS_TARGETS.join(', ')}`,
      }),
    }),
  })
  .strict();
