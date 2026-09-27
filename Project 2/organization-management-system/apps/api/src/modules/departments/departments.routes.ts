import { Router } from 'express';
import {
  listDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from './departments.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireOrgContext } from '../../middlewares/requireOrgContext.js';
import { requirePermission } from '../../middlewares/requirePermission.js';
import { PermissionAction } from '@orgsphere/shared';

const router = Router();

router.use(authenticate, requireOrgContext);

router.get('/', requirePermission(PermissionAction.DEPT_READ), listDepartments);
router.get('/:departmentId', requirePermission(PermissionAction.DEPT_READ), getDepartment);
router.post('/', requirePermission(PermissionAction.DEPT_MANAGE), createDepartment);
router.patch('/:departmentId', requirePermission(PermissionAction.DEPT_MANAGE), updateDepartment);
router.delete('/:departmentId', requirePermission(PermissionAction.DEPT_MANAGE), deleteDepartment);

export default router;
