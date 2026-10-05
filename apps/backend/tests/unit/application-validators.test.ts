import { describe, expect, it } from 'vitest';
import { LIMITS } from '../../src/validators/common';
import {
  applySchema,
  listMyApplicationsQuerySchema,
} from '../../src/validators/application.validator';

describe('apply body', () => {
  it('is empty: who applies comes from the token, never the body', () => {
    expect(applySchema.safeParse({}).success).toBe(true);
    expect(applySchema.safeParse({ applicantId: 'someone-else' }).success).toBe(false);
    expect(applySchema.safeParse({ status: 'SELECTED' }).success).toBe(false);
  });
});

describe('own-applications query', () => {
  it('defaults paging and accepts each Lab 2 status as a filter', () => {
    expect(listMyApplicationsQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: LIMITS.PAGE_SIZE_DEFAULT,
    });
    for (const status of ['APPLIED', 'SHORTLISTED', 'SELECTED', 'REJECTED']) {
      expect(listMyApplicationsQuerySchema.parse({ status })).toMatchObject({ status });
    }
  });

  it('treats a cleared filter as none and rejects anything else', () => {
    expect(listMyApplicationsQuerySchema.parse({ status: '' })).toEqual({
      page: 1,
      pageSize: LIMITS.PAGE_SIZE_DEFAULT,
    });
    expect(listMyApplicationsQuerySchema.safeParse({ status: 'WITHDRAWN' }).success).toBe(false);
    expect(
      listMyApplicationsQuerySchema.safeParse({ pageSize: String(LIMITS.PAGE_SIZE_MAX + 1) })
        .success
    ).toBe(false);
    expect(listMyApplicationsQuerySchema.safeParse({ castingRoleId: 'x' }).success).toBe(false);
  });
});
