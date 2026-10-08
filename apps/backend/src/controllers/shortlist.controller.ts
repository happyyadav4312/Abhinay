import { Request, Response } from 'express';
import { sendNoContent, sendSuccess } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import { parseOrThrow, requireUuidParam } from '../validators/common';
import {
  listApplicantsQuerySchema,
  shortlistFolderSchema,
} from '../validators/shortlist.validator';
import * as shortlistService from '../services/shortlist.service';

function currentUserId(req: Request): string {
  return (req as AuthenticatedRequest).user.id;
}

function roleId(req: Request): string {
  return requireUuidParam(req.params.id, 'Casting role');
}

function folderId(req: Request): string {
  return requireUuidParam(req.params.folderId, 'Shortlist folder');
}

/** GET /api/v1/casting/:id/applications — the author's applicant list. */
export async function listApplicantsController(req: Request, res: Response): Promise<void> {
  const id = roleId(req);
  const query = parseOrThrow(listApplicantsQuerySchema, req.query);
  sendSuccess(
    res,
    await shortlistService.listApplicants(currentUserId(req), id, query),
    'Applicants retrieved'
  );
}

/** GET /api/v1/casting/:id/shortlists */
export async function listFoldersController(req: Request, res: Response): Promise<void> {
  const folders = await shortlistService.listFolders(currentUserId(req), roleId(req));
  sendSuccess(res, { folders }, 'Shortlist folders retrieved');
}

/** POST /api/v1/casting/:id/shortlists */
export async function createFolderController(req: Request, res: Response): Promise<void> {
  const id = roleId(req);
  const input = parseOrThrow(shortlistFolderSchema, req.body);
  const folder = await shortlistService.createFolder(currentUserId(req), id, input);
  sendSuccess(res, { folder }, 'Shortlist folder created', 201);
}

/** PATCH /api/v1/casting/:id/shortlists/:folderId — rename. */
export async function renameFolderController(req: Request, res: Response): Promise<void> {
  const id = roleId(req);
  const folder = folderId(req);
  const input = parseOrThrow(shortlistFolderSchema, req.body);
  sendSuccess(
    res,
    { folder: await shortlistService.renameFolder(currentUserId(req), id, folder, input) },
    'Shortlist folder renamed'
  );
}

/** DELETE /api/v1/casting/:id/shortlists/:folderId */
export async function deleteFolderController(req: Request, res: Response): Promise<void> {
  await shortlistService.deleteFolder(currentUserId(req), roleId(req), folderId(req));
  sendNoContent(res);
}

/** PUT /api/v1/casting/:id/shortlists/:folderId/applications/:applicationId */
export async function fileApplicantController(req: Request, res: Response): Promise<void> {
  const id = roleId(req);
  const folder = folderId(req);
  const applicationId = requireUuidParam(req.params.applicationId, 'Application');
  const result = await shortlistService.fileApplicant(
    currentUserId(req),
    id,
    folder,
    applicationId
  );

  // 201 when newly filed, 200 when it was already in the folder.
  sendSuccess(
    res,
    { applicant: result.applicant },
    result.created ? 'Applicant added to folder' : 'Applicant already in folder',
    result.created ? 201 : 200
  );
}

/** DELETE /api/v1/casting/:id/shortlists/:folderId/applications/:applicationId */
export async function unfileApplicantController(req: Request, res: Response): Promise<void> {
  const id = roleId(req);
  const folder = folderId(req);
  const applicationId = requireUuidParam(req.params.applicationId, 'Application');
  await shortlistService.unfileApplicant(currentUserId(req), id, folder, applicationId);
  sendNoContent(res);
}
