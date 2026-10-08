import {
  ApplicationStatus,
  CastingRoleStatus,
  Experience,
  PortfolioItem,
  PortfolioMediaKind,
  Prisma,
  ProfileSkill,
  Role,
  Skill,
  User,
} from '@prisma/client';
import { env } from '../config/env';
import { PUBLIC_MEDIA_PATH } from '../config/storage';
import { isOnOrAfterToday } from '../utils/calendar';
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

/** The member's CV. The file is in the storage provider; this is only its link. */
export interface ResumeDto {
  url: string;
  fileName: string;
  bytes: number;
  uploadedAt: string;
}

/** A portfolio photo or show reel. */
export interface PortfolioItemDto {
  id: string;
  kind: PortfolioMediaKind;
  url: string;
  /** A still frame for a reel, when the provider makes one; otherwise null. */
  thumbnailUrl: string | null;
  title: string | null;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  createdAt: string;
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
  resume: ResumeDto | null;
  portfolio: PortfolioItemDto[];
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
  portfolio: {
    // In the order they were added, so a new upload appears at the end.
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.ProfileInclude;

type ProfileWithRelations = Prisma.ProfileGetPayload<{ include: typeof profileInclude }>;

/**
 * Absolute URL of a photo kept by the LOCAL driver, built from validated
 * configuration — never from the request Host header, which an attacker controls.
 */
export function toPhotoUrl(profileImage: string | null): string | null {
  if (!profileImage) return null;
  return `${env.PUBLIC_SERVER_URL}${PUBLIC_MEDIA_PATH}/${profileImage}`;
}

/** The columns every photo projection needs. */
export const profilePhotoSelect = {
  profileImage: true,
  profileImageUrl: true,
} satisfies Prisma.ProfileSelect;

/**
 * A profile's photo URL. Uploads store their delivery URL (Cloudinary's secure
 * URL, or the local media URL); photos from before that column existed have a
 * key only and are rebuilt as local media URLs.
 */
export function photoUrlOf(
  profile: { profileImage: string | null; profileImageUrl: string | null } | null | undefined
): string | null {
  if (!profile?.profileImage) return null;
  return profile.profileImageUrl ?? toPhotoUrl(profile.profileImage);
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

export function toPortfolioItem(item: PortfolioItem): PortfolioItemDto {
  return {
    id: item.id,
    kind: item.kind,
    url: item.url,
    thumbnailUrl: item.thumbnailUrl,
    title: item.title,
    bytes: item.bytes,
    width: item.width,
    height: item.height,
    durationSeconds: item.durationSeconds,
    createdAt: item.createdAt.toISOString(),
  };
}

function toResume(profile: ProfileWithRelations): ResumeDto | null {
  if (!profile.resumeUrl || !profile.resumeUploadedAt) return null;
  return {
    url: profile.resumeUrl,
    fileName: profile.resumeFileName ?? 'resume.pdf',
    bytes: profile.resumeBytes ?? 0,
    uploadedAt: profile.resumeUploadedAt.toISOString(),
  };
}

/**
 * The projection served to anyone, logged in or not.
 * Email, phone, userId and every timestamp are intentionally excluded, as are
 * storage keys and providers: only delivery URLs leave the server.
 */
export function toPublicProfile(profile: ProfileWithRelations): PublicProfileDto {
  return {
    id: profile.id,
    name: profile.user.name,
    role: profile.user.role,
    bio: profile.bio,
    location: profile.location,
    photoUrl: photoUrlOf(profile),
    skills: profile.skills.map(toSkillDto),
    experiences: profile.experiences.map(toExperienceDto),
    resume: toResume(profile),
    portfolio: profile.portfolio.map(toPortfolioItem),
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
  /** Last day applications are accepted, `YYYY-MM-DD`, or null for no deadline. */
  applicationDeadline: string | null;
  /** OPEN and not past its deadline — the single answer to "can anyone apply now?". */
  acceptingApplications: boolean;
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
      profile: { select: { id: true, ...profilePhotoSelect } },
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

function isAcceptingApplications(role: {
  status: CastingRoleStatus;
  applicationDeadline: Date | null;
}): boolean {
  return role.status === CastingRoleStatus.OPEN && isOnOrAfterToday(role.applicationDeadline);
}

function toCastingPoster(role: CastingRoleWithPoster): CastingPosterDto {
  return {
    profileId: role.createdBy.profile?.id ?? null,
    name: role.createdBy.name,
    role: role.createdBy.role,
    photoUrl: photoUrlOf(role.createdBy.profile),
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
    applicationDeadline: role.applicationDeadline
      ? toCalendarDateString(role.applicationDeadline)
      : null,
    acceptingApplications: isAcceptingApplications(role),
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
    applicationDeadline: role.applicationDeadline
      ? toCalendarDateString(role.applicationDeadline)
      : null,
    acceptingApplications: isAcceptingApplications(role),
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

// ── Shortlists ──────────────────────────────────────────

export interface ShortlistFolderDto {
  id: string;
  name: string;
  /** How many applications are filed in this folder. */
  applicantCount: number;
  createdAt: string;
  updatedAt: string;
}

export const shortlistFolderInclude = {
  _count: { select: { entries: true } },
} satisfies Prisma.ShortlistFolderInclude;

type FolderWithCount = Prisma.ShortlistFolderGetPayload<{
  include: typeof shortlistFolderInclude;
}>;

export function toShortlistFolder(folder: FolderWithCount): ShortlistFolderDto {
  return {
    id: folder.id,
    name: folder.name,
    applicantCount: folder._count.entries,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  };
}

/**
 * An applicant as the role's author sees them: the same public facts as a
 * public profile card (never email, phone or user id), plus where the author
 * has filed them.
 */
export interface ApplicantDto {
  applicationId: string;
  status: ApplicationStatus;
  appliedAt: string;
  applicant: {
    profileId: string | null;
    name: string;
    role: Role;
    location: string | null;
    photoUrl: string | null;
  };
  /** The author's folders this application is filed in. */
  folderIds: string[];
}

export const applicantInclude = {
  applicant: {
    select: {
      name: true,
      role: true,
      profile: { select: { id: true, location: true, ...profilePhotoSelect } },
    },
  },
  shortlistEntries: { select: { folderId: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ApplicationInclude;

type ApplicationWithApplicant = Prisma.ApplicationGetPayload<{
  include: typeof applicantInclude;
}>;

export function toApplicant(application: ApplicationWithApplicant): ApplicantDto {
  const { applicant } = application;
  return {
    applicationId: application.id,
    status: application.status,
    appliedAt: application.createdAt.toISOString(),
    applicant: {
      profileId: applicant.profile?.id ?? null,
      name: applicant.name,
      role: applicant.role,
      location: applicant.profile?.location ?? null,
      photoUrl: photoUrlOf(applicant.profile),
    },
    folderIds: application.shortlistEntries.map((entry) => entry.folderId),
  };
}
