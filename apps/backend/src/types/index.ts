import { Request } from 'express';
import { Role } from '@prisma/client';

/**
 * The verified identity attached by `authenticate`.
 * `role` is always the current database value, never the JWT claim.
 */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}
