import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError, ErrorCode, limitExceeded, notFound } from '../utils/errors';
import { LIMITS } from '../validators/common';
import {
  ListApplicantsQuery,
  normalizeFolderName,
  ShortlistFolderInput,
} from '../validators/shortlist.validator';
import {
  ApplicantDto,
  applicantInclude,
  PaginationDto,
  ShortlistFolderDto,
  shortlistFolderInclude,
  toApplicant,
  toPagination,
  toShortlistFolder,
} from './dto';

/**
 * Shortlist folders (WBS 1.2.3) and the applicant list they organise.
 *
 * Everything here belongs to one casting role and is reachable only by that
 * role's author. A role, folder or application the caller does not own is a
 * 404 — exactly what an id that never existed returns — so ids cannot be
 * probed. The `requireRole(PRODUCER, DIRECTOR)` gate on the routes runs first,
 * so any other profession gets a 403 before ownership is even considered.
 *
 * Filing an application in a folder is organisation only: it never changes the
 * application's status. Moving it to SHORTLISTED/SELECTED/REJECTED (and telling
 * the applicant) is the status workflow of WBS 1.3.
 */

export interface ApplicantPage {
  applicants: ApplicantDto[];
  pagination: PaginationDto;
}

export interface FileApplicantResult {
  applicant: ApplicantDto;
  /** false when it was already in the folder — the caller answers 200 instead of 201. */
  created: boolean;
}

const ROLE_NOT_FOUND = 'Casting role not found';
const FOLDER_NOT_FOUND = 'Shortlist folder not found';
const APPLICATION_NOT_FOUND = 'Application not found';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function folderNameTaken(): AppError {
  return new AppError(409, ErrorCode.FOLDER_NAME_TAKEN, 'A folder with this name already exists', {
    name: ['A folder with this name already exists for this role'],
  });
}

async function requireOwnedRole(userId: string, castingRoleId: string): Promise<void> {
  const role = await prisma.castingRole.findFirst({
    where: { id: castingRoleId, createdById: userId },
    select: { id: true },
  });
  if (!role) throw notFound(ROLE_NOT_FOUND);
}

/** Only folders of a role the caller owns ever match. */
function ownedFolder(
  userId: string,
  castingRoleId: string,
  folderId: string
): Prisma.ShortlistFolderWhereInput {
  return { id: folderId, castingRoleId, castingRole: { createdById: userId } };
}

async function requireOwnedFolder(
  userId: string,
  castingRoleId: string,
  folderId: string
): Promise<void> {
  await requireOwnedRole(userId, castingRoleId);
  const folder = await prisma.shortlistFolder.findFirst({
    where: ownedFolder(userId, castingRoleId, folderId),
    select: { id: true },
  });
  if (!folder) throw notFound(FOLDER_NOT_FOUND);
}

async function getApplicant(applicationId: string): Promise<ApplicantDto> {
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: applicantInclude,
  });
  return toApplicant(application);
}

// ── Applicants ──────────────────────────────────────────

/** The author's applicants for one role, newest first, optionally one folder only. */
export async function listApplicants(
  userId: string,
  castingRoleId: string,
  query: ListApplicantsQuery
): Promise<ApplicantPage> {
  await requireOwnedRole(userId, castingRoleId);

  const where: Prisma.ApplicationWhereInput = { castingRoleId };
  if (query.folderId) {
    const folder = await prisma.shortlistFolder.findFirst({
      where: { id: query.folderId, castingRoleId },
      select: { id: true },
    });
    if (!folder) throw notFound(FOLDER_NOT_FOUND);
    where.shortlistEntries = { some: { folderId: query.folderId } };
  }

  const [total, rows] = await Promise.all([
    prisma.application.count({ where }),
    prisma.application.findMany({
      where,
      include: applicantInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    applicants: rows.map(toApplicant),
    pagination: toPagination(query.page, query.pageSize, total),
  };
}

// ── Folders ─────────────────────────────────────────────

/** Folders in the order they were created, each with its applicant count. */
export async function listFolders(
  userId: string,
  castingRoleId: string
): Promise<ShortlistFolderDto[]> {
  await requireOwnedRole(userId, castingRoleId);

  const folders = await prisma.shortlistFolder.findMany({
    where: { castingRoleId },
    include: shortlistFolderInclude,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return folders.map(toShortlistFolder);
}

/**
 * Create a folder. The role row is locked for the duration, so two concurrent
 * creates cannot both squeeze past the per-role limit; the unique index on the
 * normalised name decides a duplicate, even under a race.
 */
export async function createFolder(
  userId: string,
  castingRoleId: string,
  input: ShortlistFolderInput
): Promise<ShortlistFolderDto> {
  try {
    const folderId = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM casting_roles
        WHERE id = ${castingRoleId} AND created_by_id = ${userId}
        FOR UPDATE`;
      if (locked.length === 0) throw notFound(ROLE_NOT_FOUND);

      const count = await tx.shortlistFolder.count({ where: { castingRoleId } });
      if (count >= LIMITS.SHORTLIST_FOLDERS_PER_ROLE_MAX) {
        throw limitExceeded(
          `A casting role may have at most ${LIMITS.SHORTLIST_FOLDERS_PER_ROLE_MAX} folders`,
          'name'
        );
      }

      const created = await tx.shortlistFolder.create({
        data: { castingRoleId, name: input.name, normalizedName: normalizeFolderName(input.name) },
        select: { id: true },
      });
      return created.id;
    });

    return toShortlistFolder(
      await prisma.shortlistFolder.findUniqueOrThrow({
        where: { id: folderId },
        include: shortlistFolderInclude,
      })
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw folderNameTaken();
    throw error;
  }
}

/** Rename a folder. Renaming to its own name (in any casing) is allowed. */
export async function renameFolder(
  userId: string,
  castingRoleId: string,
  folderId: string,
  input: ShortlistFolderInput
): Promise<ShortlistFolderDto> {
  let updated: Prisma.BatchPayload;
  try {
    updated = await prisma.shortlistFolder.updateMany({
      where: ownedFolder(userId, castingRoleId, folderId),
      data: { name: input.name, normalizedName: normalizeFolderName(input.name) },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw folderNameTaken();
    throw error;
  }

  if (updated.count === 0) {
    await requireOwnedRole(userId, castingRoleId);
    throw notFound(FOLDER_NOT_FOUND);
  }

  return toShortlistFolder(
    await prisma.shortlistFolder.findUniqueOrThrow({
      where: { id: folderId },
      include: shortlistFolderInclude,
    })
  );
}

/** Delete a folder. Its entries go with it; the applications themselves are untouched. */
export async function deleteFolder(
  userId: string,
  castingRoleId: string,
  folderId: string
): Promise<void> {
  const deleted = await prisma.shortlistFolder.deleteMany({
    where: ownedFolder(userId, castingRoleId, folderId),
  });

  if (deleted.count === 0) {
    await requireOwnedRole(userId, castingRoleId);
    throw notFound(FOLDER_NOT_FOUND);
  }
}

// ── Filing applicants ───────────────────────────────────

/**
 * File an application in a folder. Both must belong to the same role, which the
 * caller owns. Filing twice is idempotent: the unique pair returns the existing
 * entry with `created: false`, even when two requests race.
 */
export async function fileApplicant(
  userId: string,
  castingRoleId: string,
  folderId: string,
  applicationId: string
): Promise<FileApplicantResult> {
  await requireOwnedFolder(userId, castingRoleId, folderId);

  const application = await prisma.application.findFirst({
    where: { id: applicationId, castingRoleId },
    select: { id: true },
  });
  if (!application) throw notFound(APPLICATION_NOT_FOUND);

  let created = true;
  try {
    await prisma.shortlistEntry.create({ data: { folderId, applicationId } });
  } catch (error) {
    // Already filed — or the folder was deleted between the check and the insert.
    if (isUniqueViolation(error)) {
      created = false;
    } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw notFound(FOLDER_NOT_FOUND);
    } else {
      throw error;
    }
  }

  return { applicant: await getApplicant(applicationId), created };
}

/** Take an application out of a folder. 404 when it was not filed there. */
export async function unfileApplicant(
  userId: string,
  castingRoleId: string,
  folderId: string,
  applicationId: string
): Promise<void> {
  const deleted = await prisma.shortlistEntry.deleteMany({
    where: { applicationId, folder: ownedFolder(userId, castingRoleId, folderId) },
  });

  if (deleted.count === 0) {
    await requireOwnedFolder(userId, castingRoleId, folderId);
    throw notFound('This applicant is not in that folder');
  }
}
