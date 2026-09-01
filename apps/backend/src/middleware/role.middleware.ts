import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { AuthenticatedRequest } from '../types';
import { sendError } from '../utils/response';

/**
 * Role-Based Access Control middleware factory.
 * Restricts access to users with one of the specified roles.
 *
 * @example
 *   router.get('/admin', authenticate, requireRole('ADMIN'), handler);
 *   router.get('/crew', authenticate, requireRole('PRODUCER', 'DIRECTOR'), handler);
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      sendError(res, 'Authentication required', 401);
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      sendError(res, 'Insufficient permissions', 403);
      return;
    }

    next();
  };
}
