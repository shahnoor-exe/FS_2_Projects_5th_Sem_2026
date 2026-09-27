import { Request, Response, NextFunction } from 'express';
import { tasksService } from './tasks.service.js';
import { sendSuccess } from '../../utils/response.js';
import {
  createTaskSchema,
  updateTaskSchema,
  taskQuerySchema,
} from '@orgsphere/shared';
import { ValidationError } from '../../utils/errors.js';

export async function listTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const parseResult = taskQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return next(new ValidationError('Invalid task query parameters', parseResult.error.format()));
    }

    const { data, meta } = await tasksService.listTasks(orgId, parseResult.data);
    sendSuccess(res, data, meta);
  } catch (error) {
    next(error);
  }
}

export async function getTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const { taskId } = req.params;
    const task = await tasksService.getTask(orgId, taskId);
    sendSuccess(res, task);
  } catch (error) {
    next(error);
  }
}

export async function createTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const actorUserId = req.user?.userId;
    const parseResult = createTaskSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new ValidationError('Validation failed for task creation', parseResult.error.format()));
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const requestId = req.headers['x-request-id'] as string | undefined;

    const task = await tasksService.createTask(
      orgId,
      parseResult.data,
      actorUserId,
      ipAddress,
      requestId
    );

    sendSuccess(res, task, undefined, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const callerUserId = req.user!.userId;
    const callerPermissions = req.organization?.role?.permissions || [];
    const { taskId } = req.params;

    const parseResult = updateTaskSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new ValidationError('Validation failed for task update', parseResult.error.format()));
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const requestId = req.headers['x-request-id'] as string | undefined;

    const task = await tasksService.updateTask(
      orgId,
      taskId,
      parseResult.data,
      callerPermissions,
      callerUserId,
      ipAddress,
      requestId
    );

    sendSuccess(res, task);
  } catch (error) {
    next(error);
  }
}

export async function deleteTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const actorUserId = req.user?.userId;
    const { taskId } = req.params;

    const ipAddress = req.ip || req.socket.remoteAddress;
    const requestId = req.headers['x-request-id'] as string | undefined;

    const result = await tasksService.deleteTask(
      orgId,
      taskId,
      actorUserId,
      ipAddress,
      requestId
    );

    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}
