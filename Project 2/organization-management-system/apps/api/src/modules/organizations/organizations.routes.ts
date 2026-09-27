import { Router } from 'express';
import { getCurrentOrg, updateCurrentOrg, getDashboardMetrics } from './organizations.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireOrgContext } from '../../middlewares/requireOrgContext.js';
import { requirePermission } from '../../middlewares/requirePermission.js';
import { PermissionAction } from '@orgsphere/shared';

const router = Router();

router.use(authenticate, requireOrgContext);

router.get('/current', requirePermission(PermissionAction.ORG_READ), getCurrentOrg);
router.get('/current/dashboard', requirePermission(PermissionAction.ORG_READ), getDashboardMetrics);
router.patch('/current', requirePermission(PermissionAction.ORG_MANAGE), updateCurrentOrg);

export default router;
