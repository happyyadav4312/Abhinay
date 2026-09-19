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

/** The six roles offered during public registration. ADMIN is never selectable. */
export const PUBLIC_ROLES = ROLES.filter((role) => role !== 'ADMIN') as Exclude<Role, 'ADMIN'>[];

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

export interface PublicProfile {
  id: string;
  name: string;
  role: Role;
  bio: string | null;
  location: string | null;
  photoUrl: string | null;
  skills: Skill[];
  experiences: Experience[];
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
