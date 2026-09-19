import { Request, Response } from 'express';
import { ErrorCode } from '../utils/errors';
import { sendError } from '../utils/response';

/** 404 handler for unmatched routes, using the standard error envelope. */
export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, `Route not found: ${req.method} ${req.path}`, 404, ErrorCode.NOT_FOUND);
}
