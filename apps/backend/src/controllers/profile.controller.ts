import { Request, Response } from 'express';
import { badRequest } from '../utils/errors';
import { sendNoContent, sendSuccess } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import { parseOrThrow, requireUuidParam } from '../validators/common';
import {
  addSkillSchema,
  createExperienceSchema,
  updateExperienceSchema,
  updateProfileSchema,
} from '../validators/profile.validator';
import * as profileService from '../services/profile.service';

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

/** POST /api/v1/profile/photo — multipart, field name `photo`. */
export async function uploadPhotoController(req: Request, res: Response): Promise<void> {
  if (!req.file?.buffer) {
    throw badRequest('A multipart file field named "photo" is required', {
      photo: ['Choose a JPEG, PNG or WebP image'],
    });
  }

  const profile = await profileService.setProfilePhoto(currentUserId(req), req.file.buffer);
  sendSuccess(res, { profile }, 'Profile photo updated');
}

/** DELETE /api/v1/profile/photo */
export async function removePhotoController(req: Request, res: Response): Promise<void> {
  const profile = await profileService.removeProfilePhoto(currentUserId(req));
  sendSuccess(res, { profile }, 'Profile photo removed');
}
