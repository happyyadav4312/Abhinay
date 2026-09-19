import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { sendSuccess } from '../utils/response';
import { parseOrThrow } from '../validators/common';
import { toSafeUser } from '../services/dto';

const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

/**
 * GET /api/v1/admin/users
 *
 * A deliberately minimal, read-only, paginated listing that exists to
 * demonstrate that `requireRole(ADMIN)` is enforced server-side. It is NOT an
 * admin dashboard or a user-management subsystem: there are no mutations, no
 * role changes, and no fields beyond the standard safe user projection.
 */
export async function listUsersController(req: Request, res: Response): Promise<void> {
  const { page, pageSize } = parseOrThrow(listQuerySchema, req.query);

  const [total, users] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  sendSuccess(
    res,
    {
      users: users.map(toSafeUser),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
    },
    'Users retrieved'
  );
}
