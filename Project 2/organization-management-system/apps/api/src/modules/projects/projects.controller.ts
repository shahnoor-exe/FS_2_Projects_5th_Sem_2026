import { Request, Response, NextFunction } from 'express';
import { projectsService } from './projects.service.js';
import { sendSuccess } from '../../utils/response.js';
import {
  createProjectSchema,
  updateProjectSchema,
  projectQuerySchema,
  deleteProjectQuerySchema,
} from '@orgsphere/shared';
import { ValidationError } from '../../utils/errors.js';

export async function listProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const parseResult = projectQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return next(new ValidationError('Invalid project query parameters', parseResult.error.format()));
    }

    const { data, meta } = await projectsService.listProjects(orgId, parseResult.data);
    sendSuccess(res, data, meta);
  } catch (error) {
    next(error);
  }
}

export async function getProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const { projectId } = req.params;
    const project = await projectsService.getProject(orgId, projectId);
    sendSuccess(res, project);
  } catch (error) {
    next(error);
  }
}

export async function createProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const actorUserId = req.user?.userId;
    const parseResult = createProjectSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new ValidationError('Validation failed for project creation', parseResult.error.format()));
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const requestId = req.headers['x-request-id'] as string | undefined;

    const project = await projectsService.createProject(
      orgId,
      parseResult.data,
      actorUserId,
      ipAddress,
      requestId
    );

    sendSuccess(res, project, undefined, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const actorUserId = req.user?.userId;
    const { projectId } = req.params;
    const parseResult = updateProjectSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new ValidationError('Validation failed for project update', parseResult.error.format()));
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const requestId = req.headers['x-request-id'] as string | undefined;

    const project = await projectsService.updateProject(
      orgId,
      projectId,
      parseResult.data,
      actorUserId,
      ipAddress,
      requestId
    );

    sendSuccess(res, project);
  } catch (error) {
    next(error);
  }
}

export async function deleteProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const actorUserId = req.user?.userId;
    const { projectId } = req.params;
    const parseResult = deleteProjectQuerySchema.safeParse(req.query);
    const cascadeTasks = parseResult.success ? parseResult.data.cascadeTasks : false;

    const ipAddress = req.ip || req.socket.remoteAddress;
    const requestId = req.headers['x-request-id'] as string | undefined;

    const result = await projectsService.deleteProject(
      orgId,
      projectId,
      cascadeTasks,
      actorUserId,
      ipAddress,
      requestId
    );

    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}
