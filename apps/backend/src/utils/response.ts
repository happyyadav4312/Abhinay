import { Response } from 'express';
import { ErrorCode, ErrorCodeValue, FieldErrors } from './errors';

/**
 * One response envelope for the whole API.
 *
 *   success: { "success": true,  "message": "...", "data": ... }
 *   failure: { "success": false, "message": "...", "error": { "code", "message", "fieldErrors" } }
 *
 * `success`/`message` are kept from the original Week-1 contract so existing
 * clients and the api-conventions doc stay valid; `error.code` and
 * `error.fieldErrors` were added so the frontend can map server validation onto
 * individual form controls. A 204 carries no body at all.
 */

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Request successful',
  statusCode = 200
): void {
  res.status(statusCode).json({ success: true, message, data });
}

/** 204 No Content — never serialises a body. */
export function sendNoContent(res: Response): void {
  res.status(204).end();
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 500,
  code: ErrorCodeValue = ErrorCode.INTERNAL_ERROR,
  fieldErrors?: FieldErrors
): void {
  res.status(statusCode).json({
    success: false,
    message,
    error: {
      code,
      message,
      ...(fieldErrors ? { fieldErrors } : {}),
    },
  });
}
