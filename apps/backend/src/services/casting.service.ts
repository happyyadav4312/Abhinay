import { CastingRoleStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { addDays, today } from '../utils/calendar';
import { conflict, ErrorCode, notFound, validationFailed } from '../utils/errors';
import { LIMITS } from '../validators/common';
import {
  CastingRoleInput,
  CastingSort,
  CastingStatusTarget,
  ListCastingQuery,
  ListMyCastingQuery,
} from '../validators/casting.validator';
import {
  castingRoleDetailInclude,
  CastingRoleDto,
  castingRoleInclude,
  CastingRoleSummaryDto,
  PaginationDto,
  toCastingRole,
  toCastingRoleSummary,
  toPagination,
} from './dto';

export interface CastingRolePage {
  castingRoles: CastingRoleSummaryDto[];
  pagination: PaginationDto;
}

const NOT_FOUND_MESSAGE = 'Casting role not found';

/** The only legal moves: publish a draft, close an open role. */
const REQUIRED_SOURCE_STATUS: Record<CastingStatusTarget, CastingRoleStatus> = {
  OPEN: CastingRoleStatus.DRAFT,
  CLOSED: CastingRoleStatus.OPEN,
};

/** Statuses in which the editable fields may still change. */
const EDITABLE_STATUSES: CastingRoleStatus[] = [CastingRoleStatus.DRAFT, CastingRoleStatus.OPEN];

/**
 * Case-insensitive substring match. Prisma compiles `contains` to ILIKE without
 * escaping the pattern, so a `%` or `_` typed by a user would act as a wildcard
 * ("100%" would also match "1000"). Escape both, and the escape character.
 */
function containsText(value: string): Prisma.StringFilter<'CastingRole'> {
  return { contains: value.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' };
}

async function findPage(
  where: Prisma.CastingRoleWhereInput,
  orderBy: Prisma.CastingRoleOrderByWithRelationInput[],
  page: number,
  pageSize: number
): Promise<CastingRolePage> {
  const [total, rows] = await Promise.all([
    prisma.castingRole.count({ where }),
    prisma.castingRole.findMany({
      where,
      include: castingRoleInclude,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    castingRoles: rows.map(toCastingRoleSummary),
    pagination: toPagination(page, pageSize, total),
  };
}

/** The caller's role by id, or 404 — a role owned by someone else is indistinguishable from none. */
async function getOwnedCastingRole(userId: string, id: string): Promise<CastingRoleDto> {
  const role = await prisma.castingRole.findFirst({
    where: { id, createdById: userId },
    include: castingRoleDetailInclude(userId),
  });

  if (!role) throw notFound(NOT_FOUND_MESSAGE);
  return toCastingRole(role, userId);
}

/**
 * Explains a guarded write that matched no row: 404 when the role does not
 * exist or is not the caller's, otherwise its current status so the caller can
 * report the conflict.
 */
async function requireOwnedStatus(userId: string, id: string): Promise<CastingRoleStatus> {
  const role = await prisma.castingRole.findFirst({
    where: { id, createdById: userId },
    select: { status: true },
  });

  if (!role) throw notFound(NOT_FOUND_MESSAGE);
  return role.status;
}

/**
 * A deadline being set must fall between today and LIMITS.CASTING_DEADLINE_MAX_DAYS
 * ahead, in the platform time zone. `previous` is the stored value on an edit:
 * re-saving a role whose deadline has already passed, without touching the
 * deadline, is allowed — only a *new* past date is rejected.
 */
function assertDeadlineAcceptable(deadline: Date | null, previous: Date | null = null): void {
  if (deadline === null) return;
  if (previous !== null && deadline.getTime() === previous.getTime()) return;

  const start = today();
  if (deadline.getTime() < start.getTime()) {
    throw validationFailed({ applicationDeadline: ['The deadline cannot be in the past'] });
  }
  if (deadline.getTime() > addDays(start, LIMITS.CASTING_DEADLINE_MAX_DAYS).getTime()) {
    throw validationFailed({
      applicationDeadline: [
        `The deadline must be within ${LIMITS.CASTING_DEADLINE_MAX_DAYS} days from today`,
      ],
    });
  }
}

/** Roles that still take applications: no deadline, or a deadline not yet passed. */
function deadlineNotPassed(): Prisma.CastingRoleWhereInput {
  return { OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: today() } }] };
}

const BROWSE_ORDER: Record<CastingSort, Prisma.CastingRoleOrderByWithRelationInput[]> = {
  newest: [{ publishedAt: 'desc' }, { id: 'asc' }],
  oldest: [{ publishedAt: 'asc' }, { id: 'asc' }],
  deadline: [
    { applicationDeadline: { sort: 'asc', nulls: 'last' } },
    { publishedAt: 'desc' },
    { id: 'asc' },
  ],
};

/** Create a role as a DRAFT. Publishing is a separate, explicit step. */
export async function createCastingRole(
  userId: string,
  input: CastingRoleInput
): Promise<CastingRoleDto> {
  assertDeadlineAcceptable(input.applicationDeadline);

  const role = await prisma.castingRole.create({
    data: {
      createdById: userId,
      title: input.title,
      description: input.description,
      requirements: input.requirements,
      compensation: input.compensation,
      location: input.location,
      seekingRole: input.seekingRole,
      applicationDeadline: input.applicationDeadline,
    },
    include: castingRoleDetailInclude(userId),
  });

  return toCastingRole(role, userId);
}

/**
 * Browse: OPEN roles whose deadline has not passed. `q` matches title,
 * description, requirements, location and compensation; `seekingRole`,
 * `location` and `deadlineBefore` narrow further; `sort` picks the order.
 */
export async function listOpenCastingRoles(query: ListCastingQuery): Promise<CastingRolePage> {
  const conditions: Prisma.CastingRoleWhereInput[] = [
    { status: CastingRoleStatus.OPEN },
    deadlineNotPassed(),
  ];

  if (query.seekingRole) conditions.push({ seekingRole: query.seekingRole });
  if (query.location) conditions.push({ location: containsText(query.location) });
  if (query.deadlineBefore) {
    conditions.push({ applicationDeadline: { not: null, lte: query.deadlineBefore } });
  }
  if (query.q) {
    conditions.push({
      OR: [
        { title: containsText(query.q) },
        { description: containsText(query.q) },
        { requirements: containsText(query.q) },
        { location: containsText(query.q) },
        { compensation: containsText(query.q) },
      ],
    });
  }

  return findPage({ AND: conditions }, BROWSE_ORDER[query.sort], query.page, query.pageSize);
}

/** The caller's own roles in every status, most recently created first. */
export async function listMyCastingRoles(
  userId: string,
  query: ListMyCastingQuery
): Promise<CastingRolePage> {
  const where: Prisma.CastingRoleWhereInput = { createdById: userId };
  if (query.status) where.status = query.status;

  return findPage(where, [{ createdAt: 'desc' }, { id: 'asc' }], query.page, query.pageSize);
}

/**
 * Any signed-in user may read an OPEN or CLOSED role. A DRAFT exists only for
 * its author; everyone else gets the same 404 as for an id that was never used,
 * so drafts cannot be discovered by probing ids.
 */
export async function getCastingRole(viewerId: string, id: string): Promise<CastingRoleDto> {
  const role = await prisma.castingRole.findUnique({
    where: { id },
    include: castingRoleDetailInclude(viewerId),
  });

  if (!role || (role.status === CastingRoleStatus.DRAFT && role.createdById !== viewerId)) {
    throw notFound(NOT_FOUND_MESSAGE);
  }

  return toCastingRole(role, viewerId);
}

/**
 * Replace the editable fields of a DRAFT or OPEN role. Ownership and the status
 * guard are both part of the update predicate, so another user's id matches
 * nothing and a role closed concurrently cannot be edited afterwards.
 */
export async function updateCastingRole(
  userId: string,
  id: string,
  input: CastingRoleInput
): Promise<CastingRoleDto> {
  // Read first only to judge the deadline against the stored one; ownership and
  // status are still enforced by the conditional write below.
  const current = await prisma.castingRole.findFirst({
    where: { id, createdById: userId },
    select: { applicationDeadline: true },
  });
  if (!current) throw notFound(NOT_FOUND_MESSAGE);
  assertDeadlineAcceptable(input.applicationDeadline, current.applicationDeadline);

  const updated = await prisma.castingRole.updateMany({
    where: { id, createdById: userId, status: { in: EDITABLE_STATUSES } },
    data: {
      title: input.title,
      description: input.description,
      requirements: input.requirements,
      compensation: input.compensation,
      location: input.location,
      seekingRole: input.seekingRole,
      applicationDeadline: input.applicationDeadline,
    },
  });

  if (updated.count === 0) {
    await requireOwnedStatus(userId, id);
    throw conflict(ErrorCode.CASTING_ROLE_CLOSED, 'A closed casting role can no longer be edited');
  }

  return getOwnedCastingRole(userId, id);
}

/**
 * Publish (DRAFT → OPEN) or close (OPEN → CLOSED).
 *
 * The required source status is part of the conditional update, so when the
 * same transition is requested concurrently exactly one request performs it and
 * stamps `publishedAt`/`closedAt`. Asking for the status a role already has is
 * an idempotent success; every other move is a 409.
 *
 * A draft whose deadline has already passed cannot be published: it would be
 * listed nowhere and accept nobody. The deadline is part of the same predicate.
 */
export async function changeCastingRoleStatus(
  userId: string,
  id: string,
  target: CastingStatusTarget
): Promise<CastingRoleDto> {
  const now = new Date();

  const changed = await prisma.castingRole.updateMany({
    where: {
      id,
      createdById: userId,
      status: REQUIRED_SOURCE_STATUS[target],
      ...(target === 'OPEN' ? deadlineNotPassed() : {}),
    },
    data:
      target === 'OPEN'
        ? { status: CastingRoleStatus.OPEN, publishedAt: now }
        : { status: CastingRoleStatus.CLOSED, closedAt: now },
  });

  if (changed.count === 0) {
    const current = await requireOwnedStatus(userId, id);

    if (target === 'OPEN' && current === CastingRoleStatus.DRAFT) {
      throw conflict(
        ErrorCode.DEADLINE_PASSED,
        'The application deadline has already passed. Choose a new deadline before publishing.'
      );
    }

    if (current !== target) {
      throw conflict(
        ErrorCode.INVALID_STATUS_TRANSITION,
        current === CastingRoleStatus.CLOSED
          ? 'A closed casting role cannot be reopened'
          : 'A draft has never been published, so it cannot be closed. Delete it instead.'
      );
    }
  }

  return getOwnedCastingRole(userId, id);
}

/**
 * Only a DRAFT may be deleted: nobody else has ever seen it. A published role
 * is closed instead, so its history stays intact for anyone who saw it.
 */
export async function deleteCastingRole(userId: string, id: string): Promise<void> {
  const deleted = await prisma.castingRole.deleteMany({
    where: { id, createdById: userId, status: CastingRoleStatus.DRAFT },
  });

  if (deleted.count === 0) {
    await requireOwnedStatus(userId, id);
    throw conflict(
      ErrorCode.CASTING_ROLE_NOT_DRAFT,
      'Only drafts can be deleted. Close a published casting role instead.'
    );
  }
}
