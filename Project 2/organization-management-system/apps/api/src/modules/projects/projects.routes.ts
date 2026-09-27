import { Router } from 'express';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} from './projects.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireOrgContext } from '../../middlewares/requireOrgContext.js';
import { requirePermission } from '../../middlewares/requirePermission.js';
import { PermissionAction } from '@orgsphere/shared';

const router = Router();

router.use(authenticate, requireOrgContext);

router.get('/', requirePermission(PermissionAction.PROJECT_READ), listProjects);
router.get('/:projectId', requirePermission(PermissionAction.PROJECT_READ), getProject);
router.post('/', requirePermission(PermissionAction.PROJECT_MANAGE), createProject);
router.patch('/:projectId', requirePermission(PermissionAction.PROJECT_MANAGE), updateProject);
router.delete('/:projectId', requirePermission(PermissionAction.PROJECT_MANAGE), deleteProject);

export default router;
