import { Router } from 'express';
import {
  addPortfolioPhotoController,
  addReelController,
  addSkillController,
  createExperienceController,
  deleteExperienceController,
  deletePortfolioItemController,
  getOwnProfileController,
  getPublicProfileController,
  removePhotoController,
  removeResumeController,
  removeSkillController,
  updateExperienceController,
  updateOwnProfileController,
  uploadPhotoController,
  uploadResumeController,
} from '../controllers/profile.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireTrustedOrigin } from '../middleware/origin.middleware';
import {
  uploadPortfolioPhoto,
  uploadProfilePhoto,
  uploadReel,
  uploadResume,
} from '../middleware/upload.middleware';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

/**
 * Route order is load-bearing.
 *
 * Every literal segment (`/me`, `/skills`, `/experience`, `/photo`) is declared
 * BEFORE the parameterised `/:id`. If `/:id` came first, a request to
 * `/profile/me` with no token would fall through to the public profile lookup
 * instead of returning 401 — silently turning an authentication failure into an
 * anonymous read.
 */

// ── Own profile ─────────────────────────────────────────
router.get('/me', asyncHandler(authenticate), asyncHandler(getOwnProfileController));
router.put(
  '/me',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  asyncHandler(updateOwnProfileController)
);

// ── Skills ──────────────────────────────────────────────
router.post(
  '/skills',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  asyncHandler(addSkillController)
);
router.delete(
  '/skills/:id',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  asyncHandler(removeSkillController)
);

// ── Experience ──────────────────────────────────────────
router.post(
  '/experience',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  asyncHandler(createExperienceController)
);
router.put(
  '/experience/:id',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  asyncHandler(updateExperienceController)
);
router.delete(
  '/experience/:id',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  asyncHandler(deleteExperienceController)
);

// ── Photo ───────────────────────────────────────────────
router.post(
  '/photo',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  ...uploadProfilePhoto,
  asyncHandler(uploadPhotoController)
);
router.delete(
  '/photo',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  asyncHandler(removePhotoController)
);

// ── CV ──────────────────────────────────────────────────
// Authentication runs before multer, so an anonymous upload is refused before a
// single byte is written to the temporary directory.
router.post(
  '/resume',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  ...uploadResume,
  asyncHandler(uploadResumeController)
);
router.delete(
  '/resume',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  asyncHandler(removeResumeController)
);

// ── Portfolio photos and reels ──────────────────────────
router.post(
  '/portfolio/photos',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  ...uploadPortfolioPhoto,
  asyncHandler(addPortfolioPhotoController)
);
router.post(
  '/portfolio/videos',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  ...uploadReel,
  asyncHandler(addReelController)
);
router.delete(
  '/portfolio/:id',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  asyncHandler(deletePortfolioItemController)
);

// ── Public profile (must stay last) ─────────────────────
router.get('/:id', asyncHandler(getPublicProfileController));

export default router;
