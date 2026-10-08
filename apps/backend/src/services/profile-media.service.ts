import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { PortfolioMediaKind, StorageProvider } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import {
  MediaCategory,
  MediaResourceType,
  mediaStorage,
  StoredFileRef,
  StoredMedia,
  storageFor,
} from '../config/storage';
import {
  limitExceeded,
  mediaStorageUnavailable,
  notFound,
  validationFailed,
} from '../utils/errors';
import { LIMITS } from '../validators/common';
import { OwnProfileDto, PortfolioItemDto, toPortfolioItem } from './dto';
import { processPortfolioPhoto, processProfilePhoto } from './image.service';
import { assertPdf, detectVideo, displayFileName, MEDIA_POLICY } from './media-validation.service';
import { getOwnProfile } from './profile.service';

/**
 * Profile media (WBS 1.1.2.2 CV, 1.1.2.3 photos and reels).
 *
 * Every upload follows the same order, so that each failure leaves a clean state:
 *
 *   1. storage available?          no → 503, nothing written anywhere
 *   2. validate the temporary file  bad → 413/415/422, nothing uploaded
 *   3. upload to the provider       fails → 502, no row written
 *   4. write the row (in a txn)     fails → the uploaded copy is deleted, error
 *   5. delete the file it replaced  fails → logged; an orphan is harmless,
 *                                            a broken reference is not
 *
 * The temporary file is deleted by the upload middleware when the request ends;
 * re-encoded copies made here are deleted here.
 *
 * Replacing a photo or CV locks the profile row (`FOR UPDATE`), so two
 * concurrent uploads are applied one after the other and each deletes exactly
 * the file it replaced — neither file is orphaned, and the last one wins.
 */

export interface TempUpload {
  /** Path of the temporary file multer wrote. */
  path: string;
  /** The client's file name — display text only. */
  originalName?: string;
}

interface Slot {
  category: MediaCategory;
  resourceType: MediaResourceType;
}

const PROFILE_PHOTO: Slot = { category: 'profile-photos', resourceType: 'image' };
const RESUME: Slot = { category: 'resumes', resourceType: 'raw' };
const PORTFOLIO: Record<PortfolioMediaKind, Slot> = {
  PHOTO: { category: 'portfolio-photos', resourceType: 'image' },
  VIDEO: { category: 'reels', resourceType: 'video' },
};
const PORTFOLIO_MAX: Record<PortfolioMediaKind, number> = {
  PHOTO: LIMITS.PORTFOLIO_PHOTOS_MAX,
  VIDEO: LIMITS.PORTFOLIO_VIDEOS_MAX,
};

// ── Helpers ─────────────────────────────────────────────

function requireStorage(): void {
  if (!mediaStorage.isAvailable()) throw mediaStorageUnavailable();
}

/**
 * Best-effort delete through the driver that holds the file. Failure is logged,
 * not thrown: the user's request has already succeeded or already failed, and
 * an orphaned file costs storage, not correctness.
 */
async function removeStored(provider: StorageProvider, file: StoredFileRef): Promise<void> {
  try {
    await storageFor(provider).remove(file);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[media] could not delete ${provider} ${file.category}/${file.key}: ${reason}`);
  }
}

/** Write processed bytes to a fresh temporary file, hand its path to `use`, then delete it. */
async function withTempFile<T>(
  bytes: Buffer,
  extension: string,
  use: (filePath: string) => Promise<T>
): Promise<T> {
  await fs.mkdir(env.UPLOAD_TMP_DIR, { recursive: true });
  const filePath = path.join(env.UPLOAD_TMP_DIR, `${crypto.randomUUID()}.${extension}`);
  await fs.writeFile(filePath, bytes, { flag: 'wx' });
  try {
    return await use(filePath);
  } finally {
    await fs.rm(filePath, { force: true });
  }
}

/**
 * Run `work` with the request's temporary file, and delete that file before
 * answering — on success and on every failure. The upload middleware removes it
 * again when the response ends; this makes the deletion happen first.
 */
async function consuming<T>(upload: TempUpload, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } finally {
    await fs.rm(upload.path, { force: true });
  }
}

/** Run the database write; if it fails, delete the copy that was just uploaded. */
async function commitOrDiscard<T>(
  stored: StoredMedia,
  slot: Slot,
  write: () => Promise<T>
): Promise<T> {
  try {
    return await write();
  } catch (error) {
    await removeStored(stored.provider, { key: stored.key, ...slot });
    throw error;
  }
}

async function requireOwnProfileId(userId: string): Promise<string> {
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) throw notFound('Profile not found');
  return profile.id;
}

// ── Profile photo ───────────────────────────────────────

interface LockedPhoto {
  profile_image: string | null;
  profile_image_provider: StorageProvider | null;
}

/** Replace the profile photo with a re-encoded 512×512 WebP. */
export async function setProfilePhoto(userId: string, upload: TempUpload): Promise<OwnProfileDto> {
  const processed = await consuming(upload, async () => {
    requireStorage();
    await requireOwnProfileId(userId);
    return processProfilePhoto(await fs.readFile(upload.path));
  });
  const stored = await withTempFile(processed.bytes, processed.extension, (localPath) =>
    mediaStorage.upload({ localPath, ...PROFILE_PHOTO, extension: processed.extension })
  );

  const previous = await commitOrDiscard(stored, PROFILE_PHOTO, () =>
    prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<LockedPhoto[]>`
        SELECT profile_image, profile_image_provider FROM profiles
        WHERE user_id = ${userId}
        FOR UPDATE`;
      if (!row) throw notFound('Profile not found');

      await tx.profile.update({
        where: { userId },
        data: {
          profileImage: stored.key,
          profileImageUrl: stored.url,
          profileImageProvider: stored.provider,
        },
      });
      return row;
    })
  );

  if (previous.profile_image && previous.profile_image !== stored.key) {
    await removeStored(previous.profile_image_provider ?? StorageProvider.LOCAL, {
      key: previous.profile_image,
      ...PROFILE_PHOTO,
    });
  }

  return getOwnProfile(userId);
}

/** Remove the profile photo. Safe to repeat. */
export async function removeProfilePhoto(userId: string): Promise<OwnProfileDto> {
  const previous = await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<LockedPhoto[]>`
      SELECT profile_image, profile_image_provider FROM profiles
      WHERE user_id = ${userId}
      FOR UPDATE`;
    if (!row) throw notFound('Profile not found');

    if (row.profile_image) {
      await tx.profile.update({
        where: { userId },
        data: { profileImage: null, profileImageUrl: null, profileImageProvider: null },
      });
    }
    return row;
  });

  if (previous.profile_image) {
    await removeStored(previous.profile_image_provider ?? StorageProvider.LOCAL, {
      key: previous.profile_image,
      ...PROFILE_PHOTO,
    });
  }

  return getOwnProfile(userId);
}

// ── CV / resume ─────────────────────────────────────────

interface LockedResume {
  resume_key: string | null;
  resume_provider: StorageProvider | null;
}

/** Replace the CV with a PDF. The PDF is stored unaltered. */
export async function setResume(userId: string, upload: TempUpload): Promise<OwnProfileDto> {
  const { stored, size } = await consuming(upload, async () => {
    requireStorage();
    await requireOwnProfileId(userId);
    await assertPdf(upload.path);
    const { size: bytes } = await fs.stat(upload.path);
    return {
      size: bytes,
      stored: await mediaStorage.upload({ localPath: upload.path, ...RESUME, extension: 'pdf' }),
    };
  });

  const previous = await commitOrDiscard(stored, RESUME, () =>
    prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<LockedResume[]>`
        SELECT resume_key, resume_provider FROM profiles
        WHERE user_id = ${userId}
        FOR UPDATE`;
      if (!row) throw notFound('Profile not found');

      await tx.profile.update({
        where: { userId },
        data: {
          resumeKey: stored.key,
          resumeUrl: stored.url,
          resumeProvider: stored.provider,
          resumeFileName: displayFileName(upload.originalName, 'resume.pdf'),
          resumeBytes: stored.bytes || size,
          resumeUploadedAt: new Date(),
        },
      });
      return row;
    })
  );

  if (previous.resume_key && previous.resume_key !== stored.key) {
    await removeStored(previous.resume_provider ?? StorageProvider.LOCAL, {
      key: previous.resume_key,
      ...RESUME,
    });
  }

  return getOwnProfile(userId);
}

/** Remove the CV. Safe to repeat. */
export async function removeResume(userId: string): Promise<OwnProfileDto> {
  const previous = await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<LockedResume[]>`
      SELECT resume_key, resume_provider FROM profiles
      WHERE user_id = ${userId}
      FOR UPDATE`;
    if (!row) throw notFound('Profile not found');

    if (row.resume_key) {
      await tx.profile.update({
        where: { userId },
        data: {
          resumeKey: null,
          resumeUrl: null,
          resumeProvider: null,
          resumeFileName: null,
          resumeBytes: null,
          resumeUploadedAt: null,
        },
      });
    }
    return row;
  });

  if (previous.resume_key) {
    await removeStored(previous.resume_provider ?? StorageProvider.LOCAL, {
      key: previous.resume_key,
      ...RESUME,
    });
  }

  return getOwnProfile(userId);
}

// ── Portfolio ───────────────────────────────────────────

function portfolioLimitMessage(kind: PortfolioMediaKind): string {
  return kind === PortfolioMediaKind.PHOTO
    ? `A portfolio may hold at most ${PORTFOLIO_MAX.PHOTO} photos`
    : `A portfolio may hold at most ${PORTFOLIO_MAX.VIDEO} reels`;
}

const UPLOAD_FIELD: Record<PortfolioMediaKind, string> = { PHOTO: 'photo', VIDEO: 'video' };

/** Cheap early check, so a full portfolio does not cost an upload. */
async function assertRoomFor(profileId: string, kind: PortfolioMediaKind): Promise<void> {
  const count = await prisma.portfolioItem.count({ where: { profileId, kind } });
  if (count >= PORTFOLIO_MAX[kind]) {
    throw limitExceeded(portfolioLimitMessage(kind), UPLOAD_FIELD[kind]);
  }
}

/**
 * Insert the row under a lock on the profile, re-checking the limit: two
 * concurrent uploads cannot both take the last free slot. The loser's upload is
 * deleted by `commitOrDiscard`.
 */
async function insertPortfolioItem(
  profileId: string,
  kind: PortfolioMediaKind,
  stored: StoredMedia,
  details: { title: string | null; width: number | null; height: number | null }
): Promise<PortfolioItemDto> {
  return commitOrDiscard(stored, PORTFOLIO[kind], () =>
    prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM profiles WHERE id = ${profileId} FOR UPDATE`;

      const count = await tx.portfolioItem.count({ where: { profileId, kind } });
      if (count >= PORTFOLIO_MAX[kind]) {
        throw limitExceeded(portfolioLimitMessage(kind), UPLOAD_FIELD[kind]);
      }

      const item = await tx.portfolioItem.create({
        data: {
          profileId,
          kind,
          provider: stored.provider,
          storageKey: stored.key,
          url: stored.url,
          thumbnailUrl: stored.thumbnailUrl,
          title: details.title,
          bytes: stored.bytes,
          width: details.width,
          height: details.height,
          durationSeconds: stored.durationSeconds,
        },
      });
      return toPortfolioItem(item);
    })
  );
}

/** Add a portfolio photo, re-encoded to WebP and scaled to fit 2048 px. */
export async function addPortfolioPhoto(
  userId: string,
  upload: TempUpload,
  title: string | null
): Promise<PortfolioItemDto> {
  const { profileId, processed } = await consuming(upload, async () => {
    requireStorage();
    const id = await requireOwnProfileId(userId);
    await assertRoomFor(id, PortfolioMediaKind.PHOTO);
    return {
      profileId: id,
      processed: await processPortfolioPhoto(await fs.readFile(upload.path)),
    };
  });
  const slot = PORTFOLIO.PHOTO;
  const stored = await withTempFile(processed.bytes, processed.extension, (localPath) =>
    mediaStorage.upload({ localPath, ...slot, extension: processed.extension })
  );

  return insertPortfolioItem(profileId, PortfolioMediaKind.PHOTO, stored, {
    title,
    width: stored.width ?? processed.width,
    height: stored.height ?? processed.height,
  });
}

/**
 * Add a show reel. The video is stored as uploaded; its format is checked by
 * signature first. Its length is only known once the provider has read it, so
 * an over-long reel is deleted again and refused with 422.
 */
export async function addReel(
  userId: string,
  upload: TempUpload,
  title: string | null
): Promise<PortfolioItemDto> {
  const slot = PORTFOLIO.VIDEO;
  const { profileId, stored } = await consuming(upload, async () => {
    requireStorage();
    const id = await requireOwnProfileId(userId);
    await assertRoomFor(id, PortfolioMediaKind.VIDEO);
    const extension = await detectVideo(upload.path);
    return {
      profileId: id,
      stored: await mediaStorage.upload({ localPath: upload.path, ...slot, extension }),
    };
  });

  const maxSeconds = MEDIA_POLICY.REEL.maxDurationSeconds;
  if (stored.durationSeconds !== null && stored.durationSeconds > maxSeconds) {
    await removeStored(stored.provider, { key: stored.key, ...slot });
    throw validationFailed(
      { video: [`A reel may be at most ${maxSeconds / 60} minutes long`] },
      `A reel may be at most ${maxSeconds / 60} minutes long`
    );
  }

  return insertPortfolioItem(profileId, PortfolioMediaKind.VIDEO, stored, {
    title,
    width: stored.width,
    height: stored.height,
  });
}

/** Delete one of the caller's portfolio items, and then its file. */
export async function deletePortfolioItem(userId: string, itemId: string): Promise<void> {
  const item = await prisma.portfolioItem.findFirst({
    where: { id: itemId, profile: { userId } },
    select: { kind: true, provider: true, storageKey: true },
  });
  if (!item) throw notFound('Portfolio item not found');

  // Ownership is part of the delete predicate too; a concurrent delete answers 404.
  const deleted = await prisma.portfolioItem.deleteMany({
    where: { id: itemId, profile: { userId } },
  });
  if (deleted.count === 0) throw notFound('Portfolio item not found');

  await removeStored(item.provider, { key: item.storageKey, ...PORTFOLIO[item.kind] });
}
