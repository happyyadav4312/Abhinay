/**
 * Machine-readable error codes returned in `error.code`.
 * Clients branch on these; `message` is for humans and may be reworded.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST: 'BAD_REQUEST',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  FORBIDDEN: 'FORBIDDEN',
  FORBIDDEN_ORIGIN: 'FORBIDDEN_ORIGIN',
  MISSING_CLIENT_HEADER: 'MISSING_CLIENT_HEADER',
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  NOT_FOUND: 'NOT_FOUND',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  CASTING_ROLE_CLOSED: 'CASTING_ROLE_CLOSED',
  CASTING_ROLE_NOT_DRAFT: 'CASTING_ROLE_NOT_DRAFT',
  CASTING_ROLE_NOT_OPEN: 'CASTING_ROLE_NOT_OPEN',
  ALREADY_APPLIED: 'ALREADY_APPLIED',
  DEADLINE_PASSED: 'DEADLINE_PASSED',
  FOLDER_NAME_TAKEN: 'FOLDER_NAME_TAKEN',
  MEDIA_STORAGE_UNAVAILABLE: 'MEDIA_STORAGE_UNAVAILABLE',
  MEDIA_UPLOAD_FAILED: 'MEDIA_UPLOAD_FAILED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Per-field messages keyed by the client-facing field name. */
export type FieldErrors = Record<string, string[]>;

/**
 * An error that is safe to surface to the client verbatim.
 * Anything thrown that is NOT an AppError is treated as an unexpected fault and
 * reduced to a generic 500 by the error middleware.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCodeValue;
  public readonly fieldErrors?: FieldErrors;

  constructor(
    statusCode: number,
    code: ErrorCodeValue,
    message: string,
    fieldErrors?: FieldErrors
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.fieldErrors = fieldErrors;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const badRequest = (message: string, fieldErrors?: FieldErrors) =>
  new AppError(400, ErrorCode.BAD_REQUEST, message, fieldErrors);

export const validationFailed = (fieldErrors: FieldErrors, message = 'Validation failed') =>
  new AppError(422, ErrorCode.VALIDATION_FAILED, message, fieldErrors);

export const unauthenticated = (
  message = 'Authentication required',
  code: ErrorCodeValue = ErrorCode.UNAUTHENTICATED
) => new AppError(401, code, message);

export const invalidCredentials = () =>
  new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');

export const forbidden = (message = 'Insufficient permissions') =>
  new AppError(403, ErrorCode.FORBIDDEN, message);

/** Authenticated, but this particular action is not open to this caller. */
export const notEligible = (message: string) => new AppError(403, ErrorCode.NOT_ELIGIBLE, message);

export const notFound = (message = 'Resource not found') =>
  new AppError(404, ErrorCode.NOT_FOUND, message);

export const emailTaken = () =>
  new AppError(409, ErrorCode.EMAIL_TAKEN, 'An account with this email already exists', {
    email: ['An account with this email already exists'],
  });

/** The request is valid but clashes with the resource's current state. */
export const conflict = (code: ErrorCodeValue, message: string) => new AppError(409, code, message);

export const payloadTooLarge = (message: string) =>
  new AppError(413, ErrorCode.PAYLOAD_TOO_LARGE, message);

export const unsupportedMediaType = (message: string) =>
  new AppError(415, ErrorCode.UNSUPPORTED_MEDIA_TYPE, message);

/** A count limit (skills, portfolio items, folders) would be exceeded. */
export const limitExceeded = (message: string, field?: string) =>
  new AppError(422, ErrorCode.LIMIT_EXCEEDED, message, field ? { [field]: [message] } : undefined);

/** The media provider is not configured, so no upload can succeed right now. */
export const mediaStorageUnavailable = () =>
  new AppError(
    503,
    ErrorCode.MEDIA_STORAGE_UNAVAILABLE,
    'File uploads are not available right now. Please try again later.'
  );

/** The media provider refused or failed an upload. Nothing was saved. */
export const mediaUploadFailed = (message = 'The file could not be stored. Please try again.') =>
  new AppError(502, ErrorCode.MEDIA_UPLOAD_FAILED, message);
