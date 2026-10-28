import { z } from 'zod';
import { pageQuerySchema, pageSizeQuerySchema } from './common';

export const createConversationBodySchema = z
  .object({
    applicationId: z.string().uuid({ message: 'applicationId must be a valid UUID' }).optional(),
    castingRoleId: z.string().uuid({ message: 'castingRoleId must be a valid UUID' }).optional(),
    applicantId: z.string().uuid({ message: 'applicantId must be a valid UUID' }).optional(),
  })
  .refine((data) => data.applicationId || (data.castingRoleId && data.applicantId), {
    message: 'Either applicationId or both castingRoleId and applicantId must be provided',
  });

export type CreateConversationBody = z.infer<typeof createConversationBodySchema>;

export const sendMessageBodySchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, { message: 'Message content cannot be empty' })
      .max(2000, { message: 'Message content cannot exceed 2000 characters' }),
  })
  .strict();

export type SendMessageBody = z.infer<typeof sendMessageBodySchema>;

export const listMessagesQuerySchema = z
  .object({
    page: pageQuerySchema,
    pageSize: pageSizeQuerySchema,
  })
  .strict();

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
