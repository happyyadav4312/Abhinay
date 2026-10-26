/**
 * API access lives in `@/lib/api`, which owns the access token, refresh
 * coordination and error shaping. Re-exported here so feature code can import
 * from a single service surface.
 */
export {
  applicationsApi,
  authApi,
  castingApi,
  healthApi,
  notificationsApi,
  profileApi,
  shortlistApi,
  ApiError,
} from '@/lib/api';
export type {
  ApplicantPage,
  ApplicantsParams,
  ApplicationPage,
  ApplicationsMineParams,
  CastingListParams,
  CastingMineParams,
  CastingRolePage,
  FieldErrors,
  NotificationsListParams,
} from '@/lib/api';
