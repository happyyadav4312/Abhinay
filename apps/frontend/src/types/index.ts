/** Shared types mirroring the Express API contract in docs/api.md. */

export const ROLES = [
  'ACTOR',
  'DIRECTOR',
  'PRODUCER',
  'CAMERA_OPERATOR',
  'EDITOR',
  'OTHER_CREW',
  'ADMIN',
] as const;

export type Role = (typeof ROLES)[number];

/** Any role a member of the public can hold. */
export type PublicRole = Exclude<Role, 'ADMIN'>;

/** The six roles offered during public registration. ADMIN is never selectable. */
export const PUBLIC_ROLES = ROLES.filter((role) => role !== 'ADMIN') as PublicRole[];

/**
 * Roles allowed to post and manage casting roles. Mirrors `requireRole` on the
 * casting routes; the server stays the authority, this only shapes the UI.
 */
export const CASTING_POSTER_ROLES: readonly Role[] = ['PRODUCER', 'DIRECTOR'];

export function canPostCasting(role: Role | null | undefined): boolean {
  return role !== null && role !== undefined && CASTING_POSTER_ROLES.includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  ACTOR: 'Actor',
  DIRECTOR: 'Director',
  PRODUCER: 'Producer',
  CAMERA_OPERATOR: 'Camera Operator',
  EDITOR: 'Editor',
  OTHER_CREW: 'Other Crew',
  ADMIN: 'Administrator',
};

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface Skill {
  /** ProfileSkill.id — the handle used to remove the skill from this profile. */
  id: string;
  skillId: string;
  name: string;
}

export interface Experience {
  id: string;
  title: string;
  organization: string;
  description: string | null;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD, or null when ongoing. */
  endDate: string | null;
}

/** The member's CV — a link to the PDF in media storage. */
export interface Resume {
  url: string;
  fileName: string;
  bytes: number;
  /** ISO timestamp. */
  uploadedAt: string;
}

/** LINK is an Instagram reel, shown as a card that opens it on Instagram. */
export type PortfolioMediaKind = 'PHOTO' | 'VIDEO' | 'LINK';

/** A portfolio photo, show reel or Instagram reel link. */
export interface PortfolioItem {
  id: string;
  kind: PortfolioMediaKind;
  url: string;
  /** A still frame for a reel when the media provider makes one. */
  thumbnailUrl: string | null;
  title: string | null;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  createdAt: string;
}

export interface PublicProfile {
  id: string;
  name: string;
  role: Role;
  bio: string | null;
  location: string | null;
  photoUrl: string | null;
  skills: Skill[];
  experiences: Experience[];
  resume: Resume | null;
  portfolio: PortfolioItem[];
}

export interface OwnProfile extends PublicProfile {
  userId: string;
  email: string;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HealthData {
  api: string;
  database: string;
  timestamp: string;
  environment: string;
}

// ── Casting ─────────────────────────────────────────────

export const CASTING_ROLE_STATUSES = ['DRAFT', 'OPEN', 'CLOSED'] as const;
export type CastingRoleStatus = (typeof CASTING_ROLE_STATUSES)[number];

export const CASTING_STATUS_LABELS: Record<CastingRoleStatus, string> = {
  DRAFT: 'Draft',
  OPEN: 'Open',
  CLOSED: 'Closed',
};

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** The poster's public facts only — never their email or phone. */
export interface CastingPoster {
  profileId: string | null;
  name: string;
  role: Role;
  photoUrl: string | null;
}

/** A list entry from GET /casting or GET /casting/mine. */
export interface CastingRoleSummary {
  id: string;
  title: string;
  seekingRole: PublicRole;
  location: string;
  compensation: string;
  descriptionPreview: string;
  status: CastingRoleStatus;
  /** Last day applications are accepted, `YYYY-MM-DD`, or null for no deadline. */
  applicationDeadline: string | null;
  /** OPEN and not past its deadline. */
  acceptingApplications: boolean;
  /** ISO timestamps. */
  publishedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  postedBy: CastingPoster;
}

/** The full role from GET /casting/:id and every write. */
export interface CastingRole extends Omit<CastingRoleSummary, 'descriptionPreview'> {
  description: string;
  requirements: string;
  updatedAt: string;
  /** True when the signed-in user posted this role. */
  isOwner: boolean;
  /** The signed-in user's application to this role, if any. */
  myApplication: MyApplication | null;
  /** How many members have applied — only ever set for the author. */
  applicationCount: number | null;
}

// ── Applications ────────────────────────────────────────

/** The four statuses agreed in Lab 2. Only APPLIED is reachable until WBS 1.3. */
export const APPLICATION_STATUSES = ['APPLIED', 'SHORTLISTED', 'SELECTED', 'REJECTED'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  APPLIED: 'Applied',
  SHORTLISTED: 'Shortlisted',
  SELECTED: 'Selected',
  REJECTED: 'Rejected',
};

export interface MyApplication {
  id: string;
  status: ApplicationStatus;
  /** ISO timestamp. */
  createdAt: string;
}

/** An entry from GET /applications/mine. */
export interface Application extends MyApplication {
  updatedAt: string;
  castingRole: CastingRoleSummary;
}

/**
 * Mirrors the server's eligibility rule so the UI only offers "Apply" when it
 * can succeed: an OPEN role still before its deadline, not your own, casting
 * for your profession, and not already applied to. The server stays the authority.
 */
export function canApplyTo(role: CastingRole, viewerRole: Role | null | undefined): boolean {
  return (
    role.acceptingApplications &&
    !role.isOwner &&
    role.myApplication === null &&
    viewerRole !== null &&
    viewerRole !== undefined &&
    role.seekingRole === viewerRole
  );
}

/** The editable fields, as sent to POST /casting and PUT /casting/:id. */
export interface CastingRoleInput {
  title: string;
  description: string;
  requirements: string;
  compensation: string;
  location: string;
  seekingRole: PublicRole;
  /** `YYYY-MM-DD`, or null for no deadline. */
  applicationDeadline: string | null;
}

/** Browse orderings offered by GET /casting. */
export const CASTING_SORTS = ['newest', 'oldest', 'deadline'] as const;
export type CastingSort = (typeof CASTING_SORTS)[number];

export const CASTING_SORT_LABELS: Record<CastingSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  deadline: 'Closing soonest',
};

// ── Shortlists ──────────────────────────────────────────

/** A folder the author files a role's applicants into. */
export interface ShortlistFolder {
  id: string;
  name: string;
  applicantCount: number;
  createdAt: string;
  updatedAt: string;
}

/** An applicant as the role's author sees them: public facts plus where they are filed. */
export interface Applicant {
  applicationId: string;
  status: ApplicationStatus;
  /** ISO timestamp. */
  appliedAt: string;
  applicant: {
    profileId: string | null;
    name: string;
    role: Role;
    location: string | null;
    photoUrl: string | null;
  };
  folderIds: string[];
}
