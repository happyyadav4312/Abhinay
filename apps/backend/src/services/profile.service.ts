import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { profilePhotoStorage } from '../config/storage';
import { AppError, ErrorCode, notFound } from '../utils/errors';
import { LIMITS } from '../validators/common';
import {
  AddSkillInput,
  CreateExperienceInput,
  normalizeSkillName,
  UpdateExperienceInput,
  UpdateProfileInput,
} from '../validators/profile.validator';
import {
  ExperienceDto,
  OwnProfileDto,
  profileInclude,
  PublicProfileDto,
  SkillDto,
  toExperienceDto,
  toOwnProfile,
  toPublicProfile,
  toSkillDto,
} from './dto';
import { processProfilePhoto } from './image.service';

/** Resolve the caller's profile id once; every mutation scopes to it. */
async function requireOwnProfileId(userId: string): Promise<string> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!profile) {
    // Registration creates the profile transactionally, so this only happens if
    // data was tampered with out of band.
    throw notFound('Profile not found');
  }

  return profile.id;
}

export async function getOwnProfile(userId: string): Promise<OwnProfileDto> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    include: profileInclude,
  });

  if (!profile) throw notFound('Profile not found');
  return toOwnProfile(profile);
}

/** Public projection by Profile.id. Works without authentication. */
export async function getPublicProfile(profileId: string): Promise<PublicProfileDto> {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    include: profileInclude,
  });

  if (!profile) throw notFound('Profile not found');
  return toPublicProfile(profile);
}

/**
 * Update the editable scalars only. `name` lives on User and `bio`/`location`/
 * `phone` on Profile, so both rows move together in one transaction.
 * Skills, experiences, photo, email and role are untouched by design.
 */
export async function updateOwnProfile(
  userId: string,
  input: UpdateProfileInput
): Promise<OwnProfileDto> {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { name: input.name } }),
    prisma.profile.update({
      where: { userId },
      data: { bio: input.bio, location: input.location, phone: input.phone },
    }),
  ]);

  return getOwnProfile(userId);
}

// ── Skills ──────────────────────────────────────────────

export interface AddSkillResult {
  skill: SkillDto;
  /** false when the link already existed — the caller answers 200 instead of 201. */
  created: boolean;
}

/**
 * Link a skill to the caller's profile, creating the shared Skill row on first
 * use. Adding a skill that is already linked is idempotent and returns the
 * existing link with `created: false`.
 */
export async function addSkill(userId: string, input: AddSkillInput): Promise<AddSkillResult> {
  const profileId = await requireOwnProfileId(userId);
  const normalizedName = normalizeSkillName(input.name);

  const existingLink = await prisma.profileSkill.findFirst({
    where: { profileId, skill: { normalizedName } },
    include: { skill: true },
  });

  if (existingLink) {
    return { skill: toSkillDto(existingLink), created: false };
  }

  const linkCount = await prisma.profileSkill.count({ where: { profileId } });
  if (linkCount >= LIMITS.SKILLS_PER_PROFILE_MAX) {
    throw new AppError(
      422,
      ErrorCode.LIMIT_EXCEEDED,
      `A profile may list at most ${LIMITS.SKILLS_PER_PROFILE_MAX} skills`,
      { name: [`A profile may list at most ${LIMITS.SKILLS_PER_PROFILE_MAX} skills`] }
    );
  }

  // Two profiles may add the same new skill at once; `upsert` plus the unique
  // index on normalized_name makes the loser retry against the winner's row.
  const skill = await prisma.skill
    .upsert({
      where: { normalizedName },
      create: { name: input.name, normalizedName },
      update: {},
    })
    .catch(async (error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return prisma.skill.findUniqueOrThrow({ where: { normalizedName } });
      }
      throw error;
    });

  try {
    const link = await prisma.profileSkill.create({
      data: { profileId, skillId: skill.id },
      include: { skill: true },
    });
    return { skill: toSkillDto(link), created: true };
  } catch (error) {
    // Lost a race against the same profile adding the same skill twice.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const link = await prisma.profileSkill.findFirstOrThrow({
        where: { profileId, skillId: skill.id },
        include: { skill: true },
      });
      return { skill: toSkillDto(link), created: false };
    }
    throw error;
  }
}

/**
 * Remove one skill link. `profileId` is part of the delete predicate, so a
 * ProfileSkill.id belonging to another user matches nothing and yields 404.
 * The shared Skill row is never deleted.
 */
export async function removeSkill(userId: string, profileSkillId: string): Promise<void> {
  const profileId = await requireOwnProfileId(userId);

  const deleted = await prisma.profileSkill.deleteMany({
    where: { id: profileSkillId, profileId },
  });

  if (deleted.count === 0) {
    throw notFound('Skill not found on your profile');
  }
}

// ── Experience ──────────────────────────────────────────

export async function createExperience(
  userId: string,
  input: CreateExperienceInput
): Promise<ExperienceDto> {
  const profileId = await requireOwnProfileId(userId);

  const count = await prisma.experience.count({ where: { profileId } });
  if (count >= LIMITS.EXPERIENCES_PER_PROFILE_MAX) {
    throw new AppError(
      422,
      ErrorCode.LIMIT_EXCEEDED,
      `A profile may list at most ${LIMITS.EXPERIENCES_PER_PROFILE_MAX} experience entries`
    );
  }

  const experience = await prisma.experience.create({
    data: {
      profileId,
      title: input.title,
      organization: input.organization,
      description: input.description,
      startDate: input.startDate,
      endDate: input.endDate,
    },
  });

  return toExperienceDto(experience);
}

/**
 * Ownership is enforced by `updateMany`'s predicate rather than a read-then-write,
 * so swapping the id in the request cannot touch another user's row even under
 * concurrency. `profileId`/`userId` in the body are rejected by the validator.
 */
export async function updateExperience(
  userId: string,
  experienceId: string,
  input: UpdateExperienceInput
): Promise<ExperienceDto> {
  const profileId = await requireOwnProfileId(userId);

  const updated = await prisma.experience.updateMany({
    where: { id: experienceId, profileId },
    data: {
      title: input.title,
      organization: input.organization,
      description: input.description,
      startDate: input.startDate,
      endDate: input.endDate,
    },
  });

  if (updated.count === 0) {
    throw notFound('Experience not found on your profile');
  }

  return toExperienceDto(
    await prisma.experience.findUniqueOrThrow({ where: { id: experienceId } })
  );
}

export async function deleteExperience(userId: string, experienceId: string): Promise<void> {
  const profileId = await requireOwnProfileId(userId);

  const deleted = await prisma.experience.deleteMany({
    where: { id: experienceId, profileId },
  });

  if (deleted.count === 0) {
    throw notFound('Experience not found on your profile');
  }
}

// ── Photo ───────────────────────────────────────────────

/**
 * Replace the profile photo.
 *
 * Order matters: validate and process first, write the new file second, update
 * the row third, delete the superseded file last. If the database write fails
 * the new file is cleaned up and the old reference survives intact, so a failed
 * upload can never blank out a working photo.
 */
export async function setProfilePhoto(userId: string, upload: Buffer): Promise<OwnProfileDto> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true, profileImage: true },
  });

  if (!profile) throw notFound('Profile not found');

  const processed = await processProfilePhoto(upload);
  const newKey = await profilePhotoStorage.save(processed.bytes, processed.extension);

  try {
    await prisma.profile.update({
      where: { userId },
      data: { profileImage: newKey },
    });
  } catch (error) {
    await profilePhotoStorage.remove(newKey).catch(() => undefined);
    throw error;
  }

  if (profile.profileImage && profile.profileImage !== newKey) {
    // Best-effort: an orphaned old file is harmless, a broken reference is not.
    await profilePhotoStorage.remove(profile.profileImage).catch(() => undefined);
  }

  return getOwnProfile(userId);
}

export async function removeProfilePhoto(userId: string): Promise<OwnProfileDto> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { profileImage: true },
  });

  if (!profile) throw notFound('Profile not found');

  if (profile.profileImage) {
    await prisma.profile.update({ where: { userId }, data: { profileImage: null } });
    await profilePhotoStorage.remove(profile.profileImage).catch(() => undefined);
  }

  return getOwnProfile(userId);
}
