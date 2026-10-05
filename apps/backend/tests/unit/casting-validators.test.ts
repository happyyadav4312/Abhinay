import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import { LIMITS } from '../../src/validators/common';
import {
  castingRoleSchema,
  castingStatusSchema,
  listCastingQuerySchema,
  listMyCastingQuerySchema,
} from '../../src/validators/casting.validator';

const valid = {
  title: 'Lead — Meera',
  description: 'Investigative journalist uncovering a land scam.',
  requirements: 'Female, 25–32, fluent Malayalam.',
  compensation: '₹15,000 per day',
  location: 'Kochi',
  seekingRole: Role.ACTOR,
};

describe('casting role body', () => {
  it('accepts a complete role and trims every text field', () => {
    const parsed = castingRoleSchema.parse({
      ...valid,
      title: '  Lead — Meera  ',
      location: '\tKochi\n',
    });
    expect(parsed.title).toBe('Lead — Meera');
    expect(parsed.location).toBe('Kochi');
  });

  it('reports every missing field by name', () => {
    const result = castingRoleSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(Object.keys(result.error.flatten().fieldErrors).sort()).toEqual([
      'compensation',
      'description',
      'location',
      'requirements',
      'seekingRole',
      'title',
    ]);
  });

  it('enforces the documented bounds, treating whitespace-only text as empty', () => {
    expect(castingRoleSchema.safeParse({ ...valid, title: 'ab' }).success).toBe(false);
    expect(castingRoleSchema.safeParse({ ...valid, title: '   ' }).success).toBe(false);
    expect(
      castingRoleSchema.safeParse({ ...valid, title: 'x'.repeat(LIMITS.CASTING_TITLE_MAX + 1) })
        .success
    ).toBe(false);
    expect(
      castingRoleSchema.safeParse({
        ...valid,
        description: 'x'.repeat(LIMITS.CASTING_DESCRIPTION_MAX),
      }).success
    ).toBe(true);
    expect(
      castingRoleSchema.safeParse({
        ...valid,
        description: 'x'.repeat(LIMITS.CASTING_DESCRIPTION_MAX + 1),
      }).success
    ).toBe(false);
    expect(
      castingRoleSchema.safeParse({
        ...valid,
        compensation: 'x'.repeat(LIMITS.CASTING_COMPENSATION_MAX + 1),
      }).success
    ).toBe(false);
  });

  it('accepts the six public roles as a target and never ADMIN', () => {
    for (const role of [
      Role.ACTOR,
      Role.DIRECTOR,
      Role.PRODUCER,
      Role.CAMERA_OPERATOR,
      Role.EDITOR,
      Role.OTHER_CREW,
    ]) {
      expect(castingRoleSchema.safeParse({ ...valid, seekingRole: role }).success).toBe(true);
    }
    expect(castingRoleSchema.safeParse({ ...valid, seekingRole: Role.ADMIN }).success).toBe(false);
    expect(castingRoleSchema.safeParse({ ...valid, seekingRole: 'actor' }).success).toBe(false);
  });

  it('rejects server-managed keys instead of ignoring them', () => {
    for (const injected of [
      { status: 'OPEN' },
      { createdById: '00000000-0000-4000-8000-000000000000' },
      { publishedAt: '2026-10-05T00:00:00.000Z' },
      { id: '00000000-0000-4000-8000-000000000000' },
    ]) {
      expect(castingRoleSchema.safeParse({ ...valid, ...injected }).success).toBe(false);
    }
  });
});

describe('casting status change', () => {
  it('allows only OPEN and CLOSED as targets', () => {
    expect(castingStatusSchema.safeParse({ status: 'OPEN' }).success).toBe(true);
    expect(castingStatusSchema.safeParse({ status: 'CLOSED' }).success).toBe(true);
    expect(castingStatusSchema.safeParse({ status: 'DRAFT' }).success).toBe(false);
    expect(castingStatusSchema.safeParse({ status: 'open' }).success).toBe(false);
    expect(castingStatusSchema.safeParse({}).success).toBe(false);
    expect(castingStatusSchema.safeParse({ status: 'OPEN', publishedAt: 'x' }).success).toBe(false);
  });
});

describe('browse query', () => {
  it('defaults paging and coerces query strings to numbers', () => {
    expect(listCastingQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: LIMITS.PAGE_SIZE_DEFAULT,
    });
    expect(listCastingQuerySchema.parse({ page: '3', pageSize: '10' })).toMatchObject({
      page: 3,
      pageSize: 10,
    });
  });

  it('treats cleared filter inputs as no filter', () => {
    expect(
      listCastingQuerySchema.parse({ q: '  ', seekingRole: '', location: '', page: '' })
    ).toEqual({ page: 1, pageSize: LIMITS.PAGE_SIZE_DEFAULT });
  });

  it('trims search text and accepts a public role filter', () => {
    expect(
      listCastingQuerySchema.parse({ q: '  night shoot ', seekingRole: Role.CAMERA_OPERATOR })
    ).toMatchObject({ q: 'night shoot', seekingRole: Role.CAMERA_OPERATOR });
  });

  it('rejects out-of-range paging, unknown keys, repeated values and ADMIN', () => {
    expect(listCastingQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(listCastingQuerySchema.safeParse({ page: '1.5' }).success).toBe(false);
    expect(
      listCastingQuerySchema.safeParse({ pageSize: String(LIMITS.PAGE_SIZE_MAX + 1) }).success
    ).toBe(false);
    expect(listCastingQuerySchema.safeParse({ sort: 'oldest' }).success).toBe(false);
    expect(listCastingQuerySchema.safeParse({ q: ['a', 'b'] }).success).toBe(false);
    expect(listCastingQuerySchema.safeParse({ seekingRole: Role.ADMIN }).success).toBe(false);
    expect(
      listCastingQuerySchema.safeParse({ q: 'x'.repeat(LIMITS.CASTING_SEARCH_MAX + 1) }).success
    ).toBe(false);
  });
});

describe('own-roles query', () => {
  it('accepts an optional status filter and nothing else', () => {
    expect(listMyCastingQuerySchema.parse({ status: 'DRAFT' })).toMatchObject({
      status: 'DRAFT',
    });
    expect(listMyCastingQuerySchema.parse({ status: '' })).toEqual({
      page: 1,
      pageSize: LIMITS.PAGE_SIZE_DEFAULT,
    });
    expect(listMyCastingQuerySchema.safeParse({ status: 'ARCHIVED' }).success).toBe(false);
    expect(listMyCastingQuerySchema.safeParse({ q: 'search' }).success).toBe(false);
  });
});
