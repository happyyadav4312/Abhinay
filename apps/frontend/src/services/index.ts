/**
 * API access lives in `@/lib/api`, which owns the access token, refresh
 * coordination and error shaping. Re-exported here so feature code can import
 * from a single service surface.
 */
export { authApi, healthApi, profileApi, ApiError } from '@/lib/api';
export type { FieldErrors } from '@/lib/api';
