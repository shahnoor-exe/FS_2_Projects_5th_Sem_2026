import { Router } from 'express';
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
} from './tasks.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireOrgContext } from '../../middlewares/requireOrgContext.js';
import { requirePermission } from '../../middlewares/requirePermission.js';
import { PermissionAction } from '@orgsphere/shared';

const router = Router();

router.use(authenticate, requireOrgContext);

router.get('/', requirePermission(PermissionAction.TASK_READ), listTasks);
router.get('/:taskId', requirePermission(PermissionAction.TASK_READ), getTask);
router.post('/', requirePermission(PermissionAction.TASK_MANAGE), createTask);

// updateTask middleware: note that both managers (task:manage) and employees (task:update_assigned) can call PATCH;
// internal logic in tasksService enforces the exact employee restriction
router.patch('/:taskId', updateTask);

router.delete('/:taskId', requirePermission(PermissionAction.TASK_MANAGE), deleteTask);

export default router;
