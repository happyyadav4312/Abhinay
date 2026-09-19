import { NextFunction, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { AuthenticatedRequest } from '../types';
import { forbidden, unauthenticated } from '../utils/errors';

/**
 * Role-based access control. Must run after `authenticate`, which resolves the
 * role from the database rather than from the token claim.
 *
 *   401 — no verified identity on the request
 *   403 — verified identity whose role is not permitted
 *
 * @example router.get('/users', authenticate, requireRole(Role.ADMIN), handler)
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      next(unauthenticated('Authentication required'));
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      next(forbidden('Insufficient permissions'));
      return;
    }

    next();
  };
}
