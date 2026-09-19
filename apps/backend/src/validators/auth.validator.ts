import { z } from 'zod';
import { emailSchema, nameSchema, passwordSchema, PUBLIC_ROLES } from './common';

/**
 * `.strict()` everywhere: a body carrying `role: "ADMIN"` alongside a valid role,
 * or `passwordHash`, or `id`, is rejected outright instead of being ignored.
 */
export const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    role: z.enum(PUBLIC_ROLES, {
      errorMap: () => ({
        message: `Role must be one of: ${PUBLIC_ROLES.join(', ')}`,
      }),
    }),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    // Deliberately not the full policy: an existing account must still be able
    // to log in, and echoing policy details on login leaks nothing useful.
    password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
