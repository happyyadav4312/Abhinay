import { z } from 'zod';
import { blankToUndefined, pageQuerySchema, pageSizeQuerySchema } from './common';

/** GET /notifications — the caller's notifications, optionally unread only. */
export const listNotificationsQuerySchema = z
  .object({
    unreadOnly: z.preprocess(
      blankToUndefined,
      z
        .enum(['true', 'false'], {
          errorMap: () => ({ message: 'unreadOnly must be "true" or "false"' }),
        })
        .transform((v) => v === 'true')
        .optional()
    ),
    page: pageQuerySchema,
    pageSize: pageSizeQuerySchema,
  })
  .strict();

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
