import { describe, expect, it } from 'vitest';
import { LIMITS } from '../../src/validators/common';
import { listNotificationsQuerySchema } from '../../src/validators/notification.validator';

describe('listNotificationsQuerySchema', () => {
  it('defaults paging and handles unreadOnly', () => {
    expect(listNotificationsQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: LIMITS.PAGE_SIZE_DEFAULT,
    });

    expect(listNotificationsQuerySchema.parse({ unreadOnly: 'true' })).toEqual({
      page: 1,
      pageSize: LIMITS.PAGE_SIZE_DEFAULT,
      unreadOnly: true,
    });

    expect(listNotificationsQuerySchema.parse({ unreadOnly: 'false' })).toEqual({
      page: 1,
      pageSize: LIMITS.PAGE_SIZE_DEFAULT,
      unreadOnly: false,
    });
  });

  it('rejects invalid unreadOnly values and invalid pagination', () => {
    expect(listNotificationsQuerySchema.safeParse({ unreadOnly: 'yes' }).success).toBe(false);
    expect(listNotificationsQuerySchema.safeParse({ unreadOnly: '1' }).success).toBe(false);
    expect(listNotificationsQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(
      listNotificationsQuerySchema.safeParse({ pageSize: String(LIMITS.PAGE_SIZE_MAX + 1) }).success
    ).toBe(false);
  });
});
