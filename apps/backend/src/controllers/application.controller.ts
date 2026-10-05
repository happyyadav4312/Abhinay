import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import { parseOrThrow, requireUuidParam } from '../validators/common';
import { applySchema, listMyApplicationsQuerySchema } from '../validators/application.validator';
import * as applicationService from '../services/application.service';

/**
 * POST /api/v1/casting/:id/applications — apply as the signed-in member.
 * Eligibility (profession, ownership, status) is decided by the service.
 */
export async function applyToCastingRoleController(req: Request, res: Response): Promise<void> {
  const castingRoleId = requireUuidParam(req.params.id, 'Casting role');
  parseOrThrow(applySchema, req.body ?? {});

  const { user } = req as AuthenticatedRequest;
  const application = await applicationService.applyToCastingRole(
    { id: user.id, role: user.role },
    castingRoleId
  );
  sendSuccess(res, { application }, 'Application submitted', 201);
}

/** GET /api/v1/applications/mine */
export async function listMyApplicationsController(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listMyApplicationsQuerySchema, req.query);
  const { user } = req as AuthenticatedRequest;
  sendSuccess(
    res,
    await applicationService.listMyApplications(user.id, query),
    'Your applications retrieved'
  );
}
