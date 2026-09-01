import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

/**
 * Centralized error-handling middleware.
 * Catches all errors thrown in route handlers and middleware.
 * Hides stack traces in production.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('❌ Unhandled Error:', err.message);

  if (env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  res.status(500).json({
    success: false,
    message: env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
