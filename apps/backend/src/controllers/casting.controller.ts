import { Request, Response } from 'express';
import { sendNoContent, sendSuccess } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import { parseOrThrow, requireUuidParam } from '../validators/common';
import {
  castingRoleSchema,
  castingStatusSchema,
  listCastingQuerySchema,
  listMyCastingQuerySchema,
} from '../validators/casting.validator';
import * as castingService from '../services/casting.service';

const RESOURCE_LABEL = 'Casting role';

function currentUserId(req: Request): string {
  return (req as AuthenticatedRequest).user.id;
}

/** POST /api/v1/casting — producers and directors; created as a DRAFT. */
export async function createCastingRoleController(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(castingRoleSchema, req.body);
  const castingRole = await castingService.createCastingRole(currentUserId(req), input);
  sendSuccess(res, { castingRole }, 'Casting role created', 201);
}

/** GET /api/v1/casting — OPEN roles, for any signed-in user. */
export async function listCastingRolesController(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listCastingQuerySchema, req.query);
  sendSuccess(res, await castingService.listOpenCastingRoles(query), 'Casting roles retrieved');
}

/** GET /api/v1/casting/mine — the caller's own roles in every status. */
export async function listMyCastingRolesController(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listMyCastingQuerySchema, req.query);
  sendSuccess(
    res,
    await castingService.listMyCastingRoles(currentUserId(req), query),
    'Your casting roles retrieved'
  );
}

/** GET /api/v1/casting/:id */
export async function getCastingRoleController(req: Request, res: Response): Promise<void> {
  const id = requireUuidParam(req.params.id, RESOURCE_LABEL);
  const castingRole = await castingService.getCastingRole(currentUserId(req), id);
  sendSuccess(res, { castingRole }, 'Casting role retrieved');
}

/** PUT /api/v1/casting/:id — owner only; DRAFT or OPEN. */
export async function updateCastingRoleController(req: Request, res: Response): Promise<void> {
  const id = requireUuidParam(req.params.id, RESOURCE_LABEL);
  const input = parseOrThrow(castingRoleSchema, req.body);
  const castingRole = await castingService.updateCastingRole(currentUserId(req), id, input);
  sendSuccess(res, { castingRole }, 'Casting role updated');
}

/** PATCH /api/v1/casting/:id/status — publish or close. */
export async function changeCastingRoleStatusController(
  req: Request,
  res: Response
): Promise<void> {
  const id = requireUuidParam(req.params.id, RESOURCE_LABEL);
  const { status } = parseOrThrow(castingStatusSchema, req.body);
  const castingRole = await castingService.changeCastingRoleStatus(currentUserId(req), id, status);
  sendSuccess(
    res,
    { castingRole },
    status === 'OPEN' ? 'Casting role published' : 'Casting role closed'
  );
}

/** DELETE /api/v1/casting/:id — drafts only. */
export async function deleteCastingRoleController(req: Request, res: Response): Promise<void> {
  const id = requireUuidParam(req.params.id, RESOURCE_LABEL);
  await castingService.deleteCastingRole(currentUserId(req), id);
  sendNoContent(res);
}
