import {
  ApplicationStatus,
  CastingRoleStatus,
  Experience,
  Prisma,
  ProfileSkill,
  Role,
  Skill,
  User,
} from '@prisma/client';
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

// ── Casting ─────────────────────────────────────────────

export interface PaginationDto {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function toPagination(page: number, pageSize: number, total: number): PaginationDto {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/**
 * Who posted a casting role, as shown to applicants. The same public facts as a
 * public profile: never the poster's email, phone or user id.
 */
export interface CastingPosterDto {
  /** Profile.id, used to link to the public profile page. */
  profileId: string | null;
  name: string;
  role: Role;
  photoUrl: string | null;
}

/** A list entry: enough to scan results without the full text of every role. */
export interface CastingRoleSummaryDto {
  id: string;
  title: string;
  seekingRole: Role;
  location: string;
  compensation: string;
  descriptionPreview: string;
  status: CastingRoleStatus;
  publishedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  postedBy: CastingPosterDto;
}

/** The viewer's own application to a role, as shown on the role page. */
export interface MyApplicationDto {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
}

export interface CastingRoleDto extends Omit<CastingRoleSummaryDto, 'descriptionPreview'> {
  description: string;
  requirements: string;
  updatedAt: string;
  /** True when the viewer posted this role. Drives the owner controls in the UI. */
  isOwner: boolean;
  /** The viewer's application to this role, if they have applied. */
  myApplication: MyApplicationDto | null;
  /** How many members have applied — revealed to the author only, otherwise null. */
  applicationCount: number | null;
}

/** Prisma include for the casting projections: only the poster's public fields. */
export const castingRoleInclude = {
  createdBy: {
    select: {
      name: true,
      role: true,
      profile: { select: { id: true, profileImage: true } },
    },
  },
} satisfies Prisma.CastingRoleInclude;

type CastingRoleWithPoster = Prisma.CastingRoleGetPayload<{
  include: typeof castingRoleInclude;
}>;

/**
 * The detail include adds, in the same query, the viewer's own application (at
 * most one, by the unique constraint) and the total application count.
 */
export function castingRoleDetailInclude(viewerId: string) {
  return {
    ...castingRoleInclude,
    applications: {
      where: { applicantId: viewerId },
      select: { id: true, status: true, createdAt: true },
      take: 1,
    },
    _count: { select: { applications: true } },
  } satisfies Prisma.CastingRoleInclude;
}

type CastingRoleWithViewer = Prisma.CastingRoleGetPayload<{
  include: ReturnType<typeof castingRoleDetailInclude>;
}>;

const DESCRIPTION_PREVIEW_LENGTH = 200;

/** Whitespace-collapsed and cut on a code-point boundary, so an emoji is never split. */
function previewOf(text: string): string {
  const characters = Array.from(text.replace(/\s+/g, ' ').trim());
  if (characters.length <= DESCRIPTION_PREVIEW_LENGTH) return characters.join('');
  return `${characters
    .slice(0, DESCRIPTION_PREVIEW_LENGTH - 1)
    .join('')
    .trimEnd()}…`;
}

function toCastingPoster(role: CastingRoleWithPoster): CastingPosterDto {
  return {
    profileId: role.createdBy.profile?.id ?? null,
    name: role.createdBy.name,
    role: role.createdBy.role,
    photoUrl: toPhotoUrl(role.createdBy.profile?.profileImage ?? null),
  };
}

export function toCastingRoleSummary(role: CastingRoleWithPoster): CastingRoleSummaryDto {
  return {
    id: role.id,
    title: role.title,
    seekingRole: role.seekingRole,
    location: role.location,
    compensation: role.compensation,
    descriptionPreview: previewOf(role.description),
    status: role.status,
    publishedAt: role.publishedAt?.toISOString() ?? null,
    closedAt: role.closedAt?.toISOString() ?? null,
    createdAt: role.createdAt.toISOString(),
    postedBy: toCastingPoster(role),
  };
}

export function toCastingRole(role: CastingRoleWithViewer, viewerId: string): CastingRoleDto {
  const isOwner = role.createdById === viewerId;
  const mine = role.applications[0];

  return {
    id: role.id,
    title: role.title,
    seekingRole: role.seekingRole,
    location: role.location,
    compensation: role.compensation,
    description: role.description,
    requirements: role.requirements,
    status: role.status,
    publishedAt: role.publishedAt?.toISOString() ?? null,
    closedAt: role.closedAt?.toISOString() ?? null,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
    postedBy: toCastingPoster(role),
    isOwner,
    myApplication: mine
      ? { id: mine.id, status: mine.status, createdAt: mine.createdAt.toISOString() }
      : null,
    applicationCount: isOwner ? role._count.applications : null,
  };
}

// ── Applications ────────────────────────────────────────

/** One of the caller's applications, with the role it was made to. */
export interface ApplicationDto extends MyApplicationDto {
  updatedAt: string;
  castingRole: CastingRoleSummaryDto;
}

export const applicationInclude = {
  castingRole: { include: castingRoleInclude },
} satisfies Prisma.ApplicationInclude;

type ApplicationWithRole = Prisma.ApplicationGetPayload<{ include: typeof applicationInclude }>;

export function toApplication(application: ApplicationWithRole): ApplicationDto {
  return {
    id: application.id,
    status: application.status,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    castingRole: toCastingRoleSummary(application.castingRole),
  };
}
