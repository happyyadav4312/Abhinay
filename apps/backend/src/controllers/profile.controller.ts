import { Request, Response } from 'express';
import { badRequest } from '../utils/errors';
import { sendNoContent, sendSuccess } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import { parseOrThrow, requireUuidParam } from '../validators/common';
import {
  addSkillSchema,
  createExperienceSchema,
  portfolioUploadFieldsSchema,
  updateExperienceSchema,
  updateProfileSchema,
} from '../validators/profile.validator';
import * as profileService from '../services/profile.service';
import * as mediaService from '../services/profile-media.service';
import { TempUpload } from '../services/profile-media.service';

function currentUserId(req: Request): string {
  return (req as AuthenticatedRequest).user.id;
}

/** GET /api/v1/profile/me */
export async function getOwnProfileController(req: Request, res: Response): Promise<void> {
  const profile = await profileService.getOwnProfile(currentUserId(req));
  sendSuccess(res, { profile }, 'Profile retrieved');
}

/** PUT /api/v1/profile/me */
export async function updateOwnProfileController(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(updateProfileSchema, req.body);
  const profile = await profileService.updateOwnProfile(currentUserId(req), input);
  sendSuccess(res, { profile }, 'Profile updated');
}

/** GET /api/v1/profile/:id — public, by Profile.id. */
export async function getPublicProfileController(req: Request, res: Response): Promise<void> {
  const id = requireUuidParam(req.params.id, 'Profile');
  const profile = await profileService.getPublicProfile(id);
  sendSuccess(res, { profile }, 'Profile retrieved');
}

/** POST /api/v1/profile/skills */
export async function addSkillController(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(addSkillSchema, req.body);
  const result = await profileService.addSkill(currentUserId(req), input);

  // 201 when a new link was created, 200 when the skill was already listed.
  sendSuccess(
    res,
    { skill: result.skill },
    result.created ? 'Skill added' : 'Skill already on profile',
    result.created ? 201 : 200
  );
}

/** DELETE /api/v1/profile/skills/:id — :id is a ProfileSkill.id. */
export async function removeSkillController(req: Request, res: Response): Promise<void> {
  const id = requireUuidParam(req.params.id, 'Skill');
  await profileService.removeSkill(currentUserId(req), id);
  sendNoContent(res);
}

/** POST /api/v1/profile/experience */
export async function createExperienceController(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(createExperienceSchema, req.body);
  const experience = await profileService.createExperience(currentUserId(req), input);
  sendSuccess(res, { experience }, 'Experience created', 201);
}

/** PUT /api/v1/profile/experience/:id */
export async function updateExperienceController(req: Request, res: Response): Promise<void> {
  const id = requireUuidParam(req.params.id, 'Experience');
  const input = parseOrThrow(updateExperienceSchema, req.body);
  const experience = await profileService.updateExperience(currentUserId(req), id, input);
  sendSuccess(res, { experience }, 'Experience updated');
}

/** DELETE /api/v1/profile/experience/:id */
export async function deleteExperienceController(req: Request, res: Response): Promise<void> {
  const id = requireUuidParam(req.params.id, 'Experience');
  await profileService.deleteExperience(currentUserId(req), id);
  sendNoContent(res);
}

/** The temporary file multer wrote, or a 400 naming the field the client should have sent. */
function requireUpload(req: Request, field: string, hint: string): TempUpload {
  if (!req.file?.path) {
    throw badRequest(`A multipart file field named "${field}" is required`, { [field]: [hint] });
  }
  return { path: req.file.path, originalName: req.file.originalname };
}

/** POST /api/v1/profile/photo — multipart, field name `photo`. */
export async function uploadPhotoController(req: Request, res: Response): Promise<void> {
  const upload = requireUpload(req, 'photo', 'Choose a JPEG, PNG or WebP image');
  const profile = await mediaService.setProfilePhoto(currentUserId(req), upload);
  sendSuccess(res, { profile }, 'Profile photo updated');
}

/** DELETE /api/v1/profile/photo */
export async function removePhotoController(req: Request, res: Response): Promise<void> {
  const profile = await mediaService.removeProfilePhoto(currentUserId(req));
  sendSuccess(res, { profile }, 'Profile photo removed');
}

/** POST /api/v1/profile/resume — multipart, field name `resume` (PDF). */
export async function uploadResumeController(req: Request, res: Response): Promise<void> {
  const upload = requireUpload(req, 'resume', 'Choose a PDF file');
  const profile = await mediaService.setResume(currentUserId(req), upload);
  sendSuccess(res, { profile }, 'CV uploaded');
}

/** DELETE /api/v1/profile/resume */
export async function removeResumeController(req: Request, res: Response): Promise<void> {
  const profile = await mediaService.removeResume(currentUserId(req));
  sendSuccess(res, { profile }, 'CV removed');
}

/** POST /api/v1/profile/portfolio/photos — multipart, `photo` plus optional `title`. */
export async function addPortfolioPhotoController(req: Request, res: Response): Promise<void> {
  const upload = requireUpload(req, 'photo', 'Choose a JPEG, PNG or WebP image');
  const { title } = parseOrThrow(portfolioUploadFieldsSchema, { ...req.body });
  const item = await mediaService.addPortfolioPhoto(currentUserId(req), upload, title);
  sendSuccess(res, { item }, 'Photo added to portfolio', 201);
}

/** POST /api/v1/profile/portfolio/videos — multipart, `video` plus optional `title`. */
export async function addReelController(req: Request, res: Response): Promise<void> {
  const upload = requireUpload(req, 'video', 'Choose an MP4, MOV or WebM video');
  const { title } = parseOrThrow(portfolioUploadFieldsSchema, { ...req.body });
  const item = await mediaService.addReel(currentUserId(req), upload, title);
  sendSuccess(res, { item }, 'Reel added to portfolio', 201);
}

/** DELETE /api/v1/profile/portfolio/:id */
export async function deletePortfolioItemController(req: Request, res: Response): Promise<void> {
  const id = requireUuidParam(req.params.id, 'Portfolio item');
  await mediaService.deletePortfolioItem(currentUserId(req), id);
  sendNoContent(res);
}
