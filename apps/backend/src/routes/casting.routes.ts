import { Router } from 'express';
import { Role } from '@prisma/client';
import { applyToCastingRoleController } from '../controllers/application.controller';
import {
  changeCastingRoleStatusController,
  createCastingRoleController,
  deleteCastingRoleController,
  getCastingRoleController,
  listCastingRolesController,
  listMyCastingRolesController,
  updateCastingRoleController,
} from '../controllers/casting.controller';
import {
  createFolderController,
  deleteFolderController,
  fileApplicantController,
  listApplicantsController,
  listFoldersController,
  renameFolderController,
  unfileApplicantController,
} from '../controllers/shortlist.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireTrustedOrigin } from '../middleware/origin.middleware';
import { requireRole } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

/**
 * Producers and directors post and manage casting roles (Lab 2, FR-02). Every
 * other role may browse and read them. Ownership is enforced by the service
 * inside each mutation, so a producer can never touch another producer's role.
 */
const canPostCasting = requireRole(Role.PRODUCER, Role.DIRECTOR);

/**
 * Route order is load-bearing: `/mine` is declared before `/:id`, otherwise it
 * would be captured as an id and answered 404 instead of being authorized.
 */

// ── Discovery (any signed-in user) ──────────────────────
router.get('/', asyncHandler(authenticate), asyncHandler(listCastingRolesController));

// ── Posting (producers and directors) ───────────────────
router.post(
  '/',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  canPostCasting,
  asyncHandler(createCastingRoleController)
);
router.get(
  '/mine',
  asyncHandler(authenticate),
  canPostCasting,
  asyncHandler(listMyCastingRolesController)
);

// ── A single role (must stay after the literal routes) ──
router.get('/:id', asyncHandler(authenticate), asyncHandler(getCastingRoleController));
router.put(
  '/:id',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  canPostCasting,
  asyncHandler(updateCastingRoleController)
);
router.patch(
  '/:id/status',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  canPostCasting,
  asyncHandler(changeCastingRoleStatusController)
);
router.delete(
  '/:id',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  canPostCasting,
  asyncHandler(deleteCastingRoleController)
);

// ── Applying (any signed-in member whose profession matches) ──
// No role gate here: eligibility depends on the role being applied to, so the
// service decides it (profession, ownership, status) inside one transaction.
router.post(
  '/:id/applications',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  asyncHandler(applyToCastingRoleController)
);

// ── Applicants and shortlist folders (the role's author) ──
// The poster gate answers 403 for every other profession; the service answers
// 404 for a role, folder or application the caller does not own.
router.get(
  '/:id/applications',
  asyncHandler(authenticate),
  canPostCasting,
  asyncHandler(listApplicantsController)
);
router.get(
  '/:id/shortlists',
  asyncHandler(authenticate),
  canPostCasting,
  asyncHandler(listFoldersController)
);
router.post(
  '/:id/shortlists',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  canPostCasting,
  asyncHandler(createFolderController)
);
router.patch(
  '/:id/shortlists/:folderId',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  canPostCasting,
  asyncHandler(renameFolderController)
);
router.delete(
  '/:id/shortlists/:folderId',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  canPostCasting,
  asyncHandler(deleteFolderController)
);
router.put(
  '/:id/shortlists/:folderId/applications/:applicationId',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  canPostCasting,
  asyncHandler(fileApplicantController)
);
router.delete(
  '/:id/shortlists/:folderId/applications/:applicationId',
  requireTrustedOrigin,
  asyncHandler(authenticate),
  canPostCasting,
  asyncHandler(unfileApplicantController)
);

export default router;
