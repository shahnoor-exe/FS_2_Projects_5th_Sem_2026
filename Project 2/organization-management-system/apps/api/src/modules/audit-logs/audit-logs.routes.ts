import { Router } from 'express';
import { listAuditLogs } from './audit-logs.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireOrgContext } from '../../middlewares/requireOrgContext.js';
import { requirePermission } from '../../middlewares/requirePermission.js';
import { PermissionAction } from '@orgsphere/shared';

const router = Router();

router.use(authenticate, requireOrgContext);

router.get('/', requirePermission(PermissionAction.AUDIT_READ), listAuditLogs);

export default router;
