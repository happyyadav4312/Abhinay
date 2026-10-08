import { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { AppError, ErrorCode } from '../utils/errors';
import { sendError } from '../utils/response';

/**
 * Single exit point for every failure.
 *
 * `AppError` is deliberate and safe to echo. Everything else — Prisma faults,
 * programming errors, unexpected throws — is logged server-side and reduced to
 * a generic 500 so no stack trace, SQL fragment or internal identifier reaches
 * the client. Passwords, tokens, cookies and Authorization headers are never
 * part of what gets logged: only the method, path and message.
 */
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode, err.code, err.fieldErrors);
    return;
  }

  // express.json() body-size and syntax failures.
  if (err instanceof SyntaxError && 'body' in err) {
    sendError(res, 'Request body is not valid JSON', 400, ErrorCode.BAD_REQUEST);
    return;
  }
  if (
    typeof err === 'object' &&
    err !== null &&
    (err as { type?: string }).type === 'entity.too.large'
  ) {
    sendError(res, 'Request body is too large', 413, ErrorCode.PAYLOAD_TOO_LARGE);
    return;
  }

  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      sendError(res, 'Uploaded file is too large', 413, ErrorCode.PAYLOAD_TOO_LARGE);
      return;
    }
    // The file filter rejects a disallowed type, a wrong field name or a second file this way.
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      sendError(
        res,
        'This file type is not accepted here, or the file was sent in the wrong field',
        400,
        ErrorCode.BAD_REQUEST
      );
      return;
    }
    sendError(res, 'Invalid file upload', 400, ErrorCode.BAD_REQUEST);
    return;
  }

  // A client that disconnects mid-upload; nobody is left to answer, and the
  // temporary file has already been removed by the upload middleware.
  if (
    typeof err === 'object' &&
    err !== null &&
    ((err as { code?: string }).code === 'ECONNABORTED' ||
      (err as { message?: string }).message === 'Request aborted')
  ) {
    sendError(res, 'Upload was interrupted', 400, ErrorCode.BAD_REQUEST);
    return;
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    console.error(`[${req.method} ${req.path}] database unavailable: ${err.message}`);
    sendError(res, 'Service temporarily unavailable', 503, ErrorCode.SERVICE_UNAVAILABLE);
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${req.method} ${req.path}] unhandled error: ${message}`);
  if (env.NODE_ENV !== 'production' && err instanceof Error) {
    console.error(err.stack);
  }

  sendError(res, 'Internal server error', 500, ErrorCode.INTERNAL_ERROR);
}
