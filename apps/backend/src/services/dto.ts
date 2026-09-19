import { Experience, Prisma, ProfileSkill, Role, Skill, User } from '@prisma/client';
import { env } from '../config/env';
import { PUBLIC_MEDIA_PATH } from '../config/storage';
import { toCalendarDateString } from '../validators/common';

/**
 * Every response body is built by one of the functions below. Prisma records are
 * never spread into a response, so a new column (say `passwordHash`) can never
 * leak by accident — it has to be added to a projection explicitly.
 */

export interface SafeUserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface SkillDto {
  /** ProfileSkill.id — the handle used by DELETE /profile/skills/:id. */
  id: string;
  /** Skill.id — the shared vocabulary entry. */
  skillId: string;
  name: string;
}

export interface ExperienceDto {
  id: string;
  title: string;
  organization: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
}

export interface PublicProfileDto {
  id: string;
  name: string;
  role: Role;
  bio: string | null;
  location: string | null;
  photoUrl: string | null;
  skills: SkillDto[];
  experiences: ExperienceDto[];
}

export interface OwnProfileDto extends PublicProfileDto {
  userId: string;
  email: string;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Prisma include that satisfies the projections below, with deterministic ordering. */
export const profileInclude = {
  user: true,
  skills: {
    include: { skill: true },
    orderBy: [{ skill: { name: 'asc' } }, { id: 'asc' }],
  },
  experiences: {
    // Most recent first; `id` breaks ties so ordering and tests are stable.
    orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
  },
} satisfies Prisma.ProfileInclude;

type ProfileWithRelations = Prisma.ProfileGetPayload<{ include: typeof profileInclude }>;

/**
 * Absolute media URL built from validated configuration — never from the
 * request Host header, which an attacker controls.
 */
export function toPhotoUrl(profileImage: string | null): string | null {
  if (!profileImage) return null;
  return `${env.PUBLIC_SERVER_URL}${PUBLIC_MEDIA_PATH}/${profileImage}`;
}

export function toSafeUser(
  user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'createdAt'>
): SafeUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toSkillDto(link: ProfileSkill & { skill: Skill }): SkillDto {
  return { id: link.id, skillId: link.skill.id, name: link.skill.name };
}

export function toExperienceDto(experience: Experience): ExperienceDto {
  return {
    id: experience.id,
    title: experience.title,
    organization: experience.organization,
    description: experience.description,
    startDate: toCalendarDateString(experience.startDate),
    endDate: experience.endDate ? toCalendarDateString(experience.endDate) : null,
  };
}

/**
 * The projection served to anyone, logged in or not.
 * Email, phone, userId and every timestamp are intentionally excluded.
 */
export function toPublicProfile(profile: ProfileWithRelations): PublicProfileDto {
  return {
    id: profile.id,
    name: profile.user.name,
    role: profile.user.role,
    bio: profile.bio,
    location: profile.location,
    photoUrl: toPhotoUrl(profile.profileImage),
    skills: profile.skills.map(toSkillDto),
    experiences: profile.experiences.map(toExperienceDto),
  };
}

/** The owner additionally sees their own email and phone. */
export function toOwnProfile(profile: ProfileWithRelations): OwnProfileDto {
  return {
    ...toPublicProfile(profile),
    userId: profile.userId,
    email: profile.user.email,
    phone: profile.phone,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}
