import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import {
  calendarDateSchema,
  emailSchema,
  passwordSchema,
  PUBLIC_ROLES,
  toCalendarDateString,
  toFieldErrors,
} from '../../src/validators/common';
import { registerSchema } from '../../src/validators/auth.validator';
import {
  createExperienceSchema,
  normalizeSkillName,
  updateProfileSchema,
} from '../../src/validators/profile.validator';

describe('email normalization', () => {
  it('trims and lowercases', () => {
    expect(emailSchema.parse('  Casting.Director@Example.COM ')).toBe(
      'casting.director@example.com'
    );
  });

  it('rejects malformed addresses', () => {
    expect(emailSchema.safeParse('no-at-sign').success).toBe(false);
    expect(emailSchema.safeParse('').success).toBe(false);
  });
});

describe('password policy', () => {
  it('requires at least 12 characters', () => {
    expect(passwordSchema.safeParse('elevenchars').success).toBe(false);
    expect(passwordSchema.safeParse('twelvechars!').success).toBe(true);
  });

  it('caps input at 72 UTF-8 bytes, counting bytes not characters', () => {
    expect(passwordSchema.safeParse('a'.repeat(72)).success).toBe(true);
    expect(passwordSchema.safeParse('a'.repeat(73)).success).toBe(false);
    // 24 multi-byte characters = 72 bytes, still fine.
    expect(passwordSchema.safeParse('é'.repeat(36)).success).toBe(true);
    expect(passwordSchema.safeParse('é'.repeat(37)).success).toBe(false);
  });

  it('never alters the password it validates', () => {
    const raw = '  Padded Password  ';
    expect(passwordSchema.parse(raw)).toBe(raw);
  });
});

describe('registration allowlist', () => {
  it('offers exactly the six non-admin roles', () => {
    expect([...PUBLIC_ROLES].sort()).toEqual(
      [
        Role.ACTOR,
        Role.CAMERA_OPERATOR,
        Role.DIRECTOR,
        Role.EDITOR,
        Role.OTHER_CREW,
        Role.PRODUCER,
      ].sort()
    );
    expect(PUBLIC_ROLES).not.toContain(Role.ADMIN);
  });

  it('rejects ADMIN and any unknown key in the body', () => {
    const base = { name: 'Real Person', email: 'a@b.test', password: 'a-good-password' };

    expect(registerSchema.safeParse({ ...base, role: Role.ADMIN }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, role: Role.ACTOR }).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, role: Role.ACTOR, passwordHash: 'x' }).success).toBe(
      false
    );
  });
});

describe('calendar dates', () => {
  it('accepts a real date and round-trips it unchanged', () => {
    const parsed = calendarDateSchema.parse('2024-02-29');
    expect(toCalendarDateString(parsed)).toBe('2024-02-29');
  });

  it('rejects dates that do not exist instead of rolling them over', () => {
    expect(calendarDateSchema.safeParse('2023-02-29').success).toBe(false);
    expect(calendarDateSchema.safeParse('2023-02-30').success).toBe(false);
    expect(calendarDateSchema.safeParse('2023-13-01').success).toBe(false);
  });

  it('rejects non-ISO formats', () => {
    expect(calendarDateSchema.safeParse('01/02/2023').success).toBe(false);
    expect(calendarDateSchema.safeParse('2023-1-1').success).toBe(false);
    expect(calendarDateSchema.safeParse('2023-01-01T00:00:00Z').success).toBe(false);
  });

  it('enforces chronological order on experience entries', () => {
    const base = {
      title: 'Gaffer',
      organization: 'Studio',
      description: null,
      startDate: '2023-05-01',
    };

    expect(createExperienceSchema.safeParse({ ...base, endDate: '2023-04-30' }).success).toBe(
      false
    );
    expect(createExperienceSchema.safeParse({ ...base, endDate: '2023-05-01' }).success).toBe(true);
    expect(createExperienceSchema.safeParse({ ...base, endDate: null }).success).toBe(true);
  });
});

describe('profile update allowlist', () => {
  it('turns empty strings into null so optional fields can be cleared', () => {
    const parsed = updateProfileSchema.parse({
      name: 'Nina Rao',
      bio: '   ',
      location: null,
      phone: '  +91 90000 00000  ',
    });

    expect(parsed).toEqual({
      name: 'Nina Rao',
      bio: null,
      location: null,
      phone: '+91 90000 00000',
    });
  });

  it('rejects server-managed fields', () => {
    for (const extra of [
      { role: Role.ADMIN },
      { email: 'new@example.test' },
      { userId: 'x' },
      { id: 'x' },
      { profileImage: 'x.webp' },
      { passwordHash: 'x' },
      { skills: [] },
    ]) {
      expect(updateProfileSchema.safeParse({ name: 'Nina Rao', ...extra }).success).toBe(false);
    }
  });
});

describe('skill normalization', () => {
  it('collapses case and whitespace to one identity', () => {
    const forms = ['Method Acting', '  method   acting ', 'METHOD ACTING'];
    expect(new Set(forms.map(normalizeSkillName)).size).toBe(1);
    expect(normalizeSkillName(forms[0])).toBe('method acting');
  });

  it('keeps distinct skills distinct', () => {
    expect(normalizeSkillName('Editing')).not.toBe(normalizeSkillName('Sound Editing'));
  });
});

describe('field error flattening', () => {
  it('groups messages under their field path', () => {
    const result = registerSchema.safeParse({
      name: 'A',
      email: 'bad',
      password: 'short',
      role: 'ADMIN',
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    const fieldErrors = toFieldErrors(result.error);
    expect(Object.keys(fieldErrors).sort()).toEqual(['email', 'name', 'password', 'role']);
    expect(fieldErrors.password[0]).toMatch(/at least 12/);
  });
});
