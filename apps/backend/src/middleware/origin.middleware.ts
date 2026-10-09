import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError, ErrorCode } from '../utils/errors';

/**
 * A non-simple header, so a cross-site form post or image tag can never reach a
 * cookie-authenticated endpoint without first passing a CORS preflight that the
 * allowlist rejects.
 */
export const CLIENT_HEADER = 'x-abhinay-client';
export const CLIENT_HEADER_VALUE = 'web';

/**
 * Browsers treat localhost and 127.0.0.1 as different origins even though
 * they point to the same local machine. Accept both during development so
 * switching between the common local URLs does not look like a network error.
 * Production remains pinned to the configured frontend origin.
 */
export function isTrustedOrigin(origin: string): boolean {
  if (origin === env.FRONTEND_URL) return true;
  if (env.NODE_ENV !== 'development') return false;

  try {
    const configured = new URL(env.FRONTEND_URL);
    const candidate = new URL(origin);
    const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

    return (
      localHosts.has(configured.hostname) &&
      localHosts.has(candidate.hostname) &&
      configured.protocol === candidate.protocol &&
      configured.port === candidate.port
    );
  } catch {
    return false;
  }
}

/**
 * Reject state-changing requests that arrive from an origin we do not trust.
 *
 * A browser always sends `Origin` on cross-origin and on POST requests. A
 * missing `Origin` therefore means a non-browser client (curl, Postman, the
 * integration suite), which is allowed — those clients cannot carry a victim's
 * ambient cookies, so they are not a CSRF vector. A literal `null` origin
 * (sandboxed iframe, `data:` document, some redirect chains) is untrusted and
 * always rejected.
 */
export function requireTrustedOrigin(req: Request, _res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  if (origin === undefined) {
    next();
    return;
  }

  if (origin === 'null' || !isTrustedOrigin(origin)) {
    next(new AppError(403, ErrorCode.FORBIDDEN_ORIGIN, 'Request origin is not allowed'));
    return;
  }

  next();
}

/**
 * Require `X-Abhinay-Client: web` on endpoints authenticated purely by the
 * refresh cookie (refresh, logout).
 *
 * Non-browser clients simply set the header themselves; it is documented in
 * docs/api.md and pre-set in the Postman collection.
 */
export function requireClientHeader(req: Request, _res: Response, next: NextFunction): void {
  const value = req.headers[CLIENT_HEADER];

  if (value !== CLIENT_HEADER_VALUE) {
    next(
      new AppError(
        403,
        ErrorCode.MISSING_CLIENT_HEADER,
        `This endpoint requires the ${CLIENT_HEADER}: ${CLIENT_HEADER_VALUE} header`
      )
    );
    return;
  }

  next();
}
