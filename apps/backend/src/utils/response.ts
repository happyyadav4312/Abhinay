import { Response } from 'express';

/**
 * Send a standardized success response.
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Request successful',
  statusCode = 200
): void {
  res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

/**
 * Send a standardized error response.
 */
export function sendError(
  res: Response,
  message: string,
  statusCode = 500,
  errors?: string[]
): void {
  res.status(statusCode).json({
    success: false,
    message,
    ...(errors && { errors }),
  });
}
