import { z } from 'zod';
import {
  blankToUndefined,
  calendarDateSchema,
  pageQuerySchema,
  pageSizeQuerySchema,
} from './common';

export const requestAuditionBodySchema = z
  .object({
    castingRoleId: z.string().uuid({ message: 'castingRoleId must be a valid UUID' }),
    applicationId: z.string().uuid({ message: 'applicationId must be a valid UUID' }),
    instructions: z
      .string()
      .trim()
      .min(1, { message: 'Instructions are required' })
      .max(5000, { message: 'Instructions must not exceed 5000 characters' }),
    deadline: z.preprocess(
      (value) => (value === undefined || value === null || value === '' ? null : value),
      z.union([z.null(), calendarDateSchema])
    ).optional(),
  })
  .strict();

export type RequestAuditionBody = z.infer<typeof requestAuditionBodySchema>;

export const submitAuditionBodySchema = z
  .object({
    note: z
      .string()
      .trim()
      .max(1000, { message: 'Note must not exceed 1000 characters' })
      .optional(),
  })
  .strict();

export type SubmitAuditionBody = z.infer<typeof submitAuditionBodySchema>;

export const updateAuditionStatusBodySchema = z
  .object({
    status: z.enum(['UNDER_REVIEW', 'APPROVED', 'REJECTED'], {
      errorMap: () => ({ message: 'Status must be UNDER_REVIEW, APPROVED, or REJECTED' }),
    }),
  })
  .strict();

export type UpdateAuditionStatusBody = z.infer<typeof updateAuditionStatusBodySchema>;

export const listAuditionsQuerySchema = z
  .object({
    status: z.preprocess(
      blankToUndefined,
      z
        .enum(['PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'])
        .optional()
    ),
    page: pageQuerySchema,
    pageSize: pageSizeQuerySchema,
  })
  .strict();

export type ListAuditionsQuery = z.infer<typeof listAuditionsQuerySchema>;
