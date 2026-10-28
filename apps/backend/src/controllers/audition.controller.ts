import { AuditionStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import { parseOrThrow, requireUuidParam } from '../validators/common';
import {
  listAuditionsQuerySchema,
  requestAuditionBodySchema,
  submitAuditionBodySchema,
  updateAuditionStatusBodySchema,
} from '../validators/audition.validator';
import * as auditionService from '../services/audition.service';
import { badRequest } from '../utils/errors';

/** POST /auditions — request an audition from a shortlisted applicant */
export async function requestAuditionController(req: Request, res: Response): Promise<void> {
  const body = parseOrThrow(requestAuditionBodySchema, req.body);
  const { user } = req as AuthenticatedRequest;
  const audition = await auditionService.requestAudition(user.id, body);
  sendSuccess(res, { audition }, 'Audition requested', 201);
}

/** POST /auditions/:id/submissions — applicant uploads a self-tape */
export async function submitAuditionController(req: Request, res: Response): Promise<void> {
  const auditionId = requireUuidParam(req.params.id, 'Audition');
  if (!req.file) {
    throw badRequest('Video file is required', { video: ['Please choose a video to upload'] });
  }

  const body = parseOrThrow(submitAuditionBodySchema, req.body);
  const { user } = req as AuthenticatedRequest;

  const audition = await auditionService.submitAudition(
    user.id,
    auditionId,
    { path: req.file.path, originalName: req.file.originalname },
    body.note
  );

  sendSuccess(res, { audition }, 'Audition video submitted', 201);
}

/** PATCH /auditions/:id/status — role author updates status */
export async function updateAuditionStatusController(req: Request, res: Response): Promise<void> {
  const auditionId = requireUuidParam(req.params.id, 'Audition');
  const body = parseOrThrow(updateAuditionStatusBodySchema, req.body);
  const { user } = req as AuthenticatedRequest;
  const audition = await auditionService.updateAuditionStatus(
    user.id,
    auditionId,
    body.status as AuditionStatus
  );
  sendSuccess(res, { audition }, 'Audition status updated');
}

/** GET /auditions/mine — list current user's auditions (as applicant) */
export async function listMyAuditionsController(req: Request, res: Response): Promise<void> {
  const query = parseOrThrow(listAuditionsQuerySchema, req.query);
  const { user } = req as AuthenticatedRequest;
  const result = await auditionService.listMyAuditions(user.id, {
    status: query.status as AuditionStatus | undefined,
    page: query.page,
    pageSize: query.pageSize,
  });
  sendSuccess(res, result, 'Auditions retrieved');
}

/** GET /auditions/:id — get single audition details */
export async function getAuditionController(req: Request, res: Response): Promise<void> {
  const auditionId = requireUuidParam(req.params.id, 'Audition');
  const { user } = req as AuthenticatedRequest;
  const audition = await auditionService.getAudition(auditionId, user.id);
  sendSuccess(res, { audition }, 'Audition retrieved');
}

/** GET /casting/:id/auditions — list auditions for a specific casting role */
export async function listAuditionsForRoleController(req: Request, res: Response): Promise<void> {
  const castingRoleId = requireUuidParam(req.params.id, 'Casting Role');
  const query = parseOrThrow(listAuditionsQuerySchema, req.query);
  const { user } = req as AuthenticatedRequest;
  const result = await auditionService.listAuditionsForRole(user.id, castingRoleId, {
    status: query.status as AuditionStatus | undefined,
    page: query.page,
    pageSize: query.pageSize,
  });
  sendSuccess(res, result, 'Role auditions retrieved');
}

