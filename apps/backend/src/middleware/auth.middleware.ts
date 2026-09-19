import { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/database';
import { ErrorCode, unauthenticated } from '../utils/errors';
import { verifyAccessToken } from '../utils/jwt';
import { AuthenticatedRequest } from '../types';

/**
 * Verify the Bearer access token and attach the current user.
 *
 * The role is read from the database on every request rather than trusted from
 * the JWT claim, so a demotion takes effect immediately instead of lingering
 * until the token expires.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    next(unauthenticated('Access token is required'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    next(unauthenticated('Access token is required'));
    return;
  }

  let subject: string;
  try {
    subject = verifyAccessToken(token).sub;
  } catch {
    next(unauthenticated('Invalid or expired access token', ErrorCode.INVALID_TOKEN));
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: subject },
    select: { id: true, email: true, role: true },
  });

  if (!user) {
    next(unauthenticated('Invalid or expired access token', ErrorCode.INVALID_TOKEN));
    return;
  }

  (req as AuthenticatedRequest).user = user;
  next();
}
