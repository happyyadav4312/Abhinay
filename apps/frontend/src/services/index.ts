/**
 * API access lives in `@/lib/api`, which owns the access token, refresh
 * coordination and error shaping. Re-exported here so feature code can import
 * from a single service surface.
 */
export { applicationsApi, authApi, castingApi, healthApi, profileApi, ApiError } from '@/lib/api';
export type {
  ApplicationPage,
  ApplicationsMineParams,
  CastingListParams,
  CastingMineParams,
  CastingRolePage,
  FieldErrors,
} from '@/lib/api';
