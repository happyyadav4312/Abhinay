import { describe, expect, it } from 'vitest';
import { LIMITS } from '../../src/validators/common';
import {
  listApplicantsQuerySchema,
  normalizeFolderName,
  shortlistFolderSchema,
} from '../../src/validators/shortlist.validator';

describe('shortlist folder name', () => {
  it('trims and collapses whitespace, keeping the display casing', () => {
    expect(shortlistFolderSchema.parse({ name: '  Second   round  ' })).toEqual({
      name: 'Second round',
    });
  });

  it('normalises identity so casing and spacing do not create duplicates', () => {
    expect(normalizeFolderName('  CallBacks ')).toBe(normalizeFolderName('callbacks'));
    expect(normalizeFolderName('Second   Round')).toBe('second round');
  });

  it('rejects blank, over-long, non-text and extra fields', () => {
    expect(shortlistFolderSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(shortlistFolderSchema.safeParse({}).success).toBe(false);
    expect(shortlistFolderSchema.safeParse({ name: 42 }).success).toBe(false);
    expect(
      shortlistFolderSchema.safeParse({ name: 'x'.repeat(LIMITS.SHORTLIST_FOLDER_NAME_MAX + 1) })
        .success
    ).toBe(false);
    expect(
      shortlistFolderSchema.safeParse({ name: 'x'.repeat(LIMITS.SHORTLIST_FOLDER_NAME_MAX) })
        .success
    ).toBe(true);
    expect(
      shortlistFolderSchema.safeParse({ name: 'A', castingRoleId: 'someone-else' }).success
    ).toBe(false);
  });
});

describe('applicant list query', () => {
  it('accepts an optional folder id and paging', () => {
    expect(listApplicantsQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: LIMITS.PAGE_SIZE_DEFAULT,
    });
    expect(listApplicantsQuerySchema.parse({ folderId: '' }).folderId).toBeUndefined();
    expect(
      listApplicantsQuerySchema.parse({ folderId: '6f1c1e9e-8f7b-4f0e-9a8e-1b2c3d4e5f60' }).folderId
    ).toBe('6f1c1e9e-8f7b-4f0e-9a8e-1b2c3d4e5f60');
  });

  it('rejects a malformed folder id and unknown keys', () => {
    expect(listApplicantsQuerySchema.safeParse({ folderId: 'abc' }).success).toBe(false);
    expect(listApplicantsQuerySchema.safeParse({ status: 'APPLIED' }).success).toBe(false);
  });
});
