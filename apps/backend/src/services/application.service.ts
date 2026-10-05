import { CastingRoleStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '../config/database';
import { conflict, ErrorCode, notEligible, notFound } from '../utils/errors';
import { ListMyApplicationsQuery } from '../validators/application.validator';
import {
  ApplicationDto,
  applicationInclude,
  PaginationDto,
  toApplication,
  toPagination,
} from './dto';

export interface ApplicationPage {
  applications: ApplicationDto[];
  pagination: PaginationDto;
}

/** The facts the eligibility rules need, read under a row lock. */
interface LockedCastingRole {
  status: CastingRoleStatus;
  created_by_id: string;
  seeking_role: Role;
}

/** "CAMERA_OPERATOR" → "camera operator", for messages. */
function professionName(role: Role): string {
  return role.toLowerCase().replace(/_/g, ' ');
}

/**
 * Apply to a casting role as `applicant`.
 *
 * The rules, in the order they are checked:
 *   404 — the role does not exist, or is someone else's draft (drafts are
 *         invisible to everyone but their author);
 *   403 — it is the applicant's own role;
 *   409 — it is not OPEN (a closed role takes no more applications);
 *   403 — the applicant's profession is not the one the role is casting for;
 *   409 — they have already applied (the unique pair decides, even under
 *         concurrent requests).
 *
 * The role row is read `FOR SHARE` inside the transaction, so a concurrent
 * close waits until this application is committed: an application can never
 * land on a role that was closed first.
 */
export async function applyToCastingRole(
  applicant: { id: string; role: Role },
  castingRoleId: string
): Promise<ApplicationDto> {
  let applicationId: string;

  try {
    applicationId = await prisma.$transaction(async (tx) => {
      const [role] = await tx.$queryRaw<LockedCastingRole[]>`
        SELECT status, created_by_id, seeking_role
        FROM casting_roles
        WHERE id = ${castingRoleId}
        FOR SHARE`;

      if (
        !role ||
        (role.status === CastingRoleStatus.DRAFT && role.created_by_id !== applicant.id)
      ) {
        throw notFound('Casting role not found');
      }
      if (role.created_by_id === applicant.id) {
        throw notEligible('You cannot apply to your own casting role');
      }
      if (role.status !== CastingRoleStatus.OPEN) {
        throw conflict(
          ErrorCode.CASTING_ROLE_NOT_OPEN,
          'This casting role is closed to new applications'
        );
      }
      if (role.seeking_role !== applicant.role) {
        throw notEligible(
          `Only ${professionName(role.seeking_role)} profiles can apply to this role`
        );
      }

      const created = await tx.application.create({
        data: { castingRoleId, applicantId: applicant.id },
        select: { id: true },
      });
      return created.id;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflict(ErrorCode.ALREADY_APPLIED, 'You have already applied to this casting role');
    }
    throw error;
  }

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: applicationInclude,
  });
  return toApplication(application);
}

/** The caller's own applications, most recent first, each with its role. */
export async function listMyApplications(
  userId: string,
  query: ListMyApplicationsQuery
): Promise<ApplicationPage> {
  const where: Prisma.ApplicationWhereInput = { applicantId: userId };
  if (query.status) where.status = query.status;

  const [total, rows] = await Promise.all([
    prisma.application.count({ where }),
    prisma.application.findMany({
      where,
      include: applicationInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    applications: rows.map(toApplication),
    pagination: toPagination(query.page, query.pageSize, total),
  };
}
