import { Router } from 'express';
import {
  listMemberships,
  getMembership,
  addMember,
  updateMemberRole,
  updateMemberStatus,
} from './memberships.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireOrgContext } from '../../middlewares/requireOrgContext.js';
import { requirePermission } from '../../middlewares/requirePermission.js';
import { PermissionAction } from '@orgsphere/shared';

const router = Router();

router.use(authenticate, requireOrgContext);

router.get('/', requirePermission(PermissionAction.MEMBER_READ), listMemberships);
router.get('/:membershipId', requirePermission(PermissionAction.MEMBER_READ), getMembership);
router.post('/', requirePermission(PermissionAction.MEMBER_MANAGE), addMember);
router.patch('/:membershipId/role', requirePermission(PermissionAction.MEMBER_MANAGE), updateMemberRole);
router.patch('/:membershipId/status', requirePermission(PermissionAction.MEMBER_MANAGE), updateMemberStatus);

export default router;
