import { Request, Response, NextFunction } from 'express';
import { departmentsService } from './departments.service.js';
import { sendSuccess } from '../../utils/response.js';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  departmentQuerySchema,
} from '@orgsphere/shared';
import { ValidationError } from '../../utils/errors.js';

export async function listDepartments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const parseResult = departmentQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return next(new ValidationError('Invalid department query parameters', parseResult.error.format()));
    }

    const { data, meta } = await departmentsService.listDepartments(orgId, parseResult.data);
    sendSuccess(res, data, meta);
  } catch (error) {
    next(error);
  }
}

export async function getDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const { departmentId } = req.params;
    const department = await departmentsService.getDepartment(orgId, departmentId);
    sendSuccess(res, department);
  } catch (error) {
    next(error);
  }
}

export async function createDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const parseResult = createDepartmentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new ValidationError('Validation failed for department creation', parseResult.error.format()));
    }

    const actorId = req.user?.userId;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const requestId = req.headers['x-request-id'] as string | undefined;

    const department = await departmentsService.createDepartment(
      orgId,
      parseResult.data,
      actorId,
      ipAddress,
      requestId
    );

    sendSuccess(res, department, undefined, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const { departmentId } = req.params;
    const parseResult = updateDepartmentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new ValidationError('Validation failed for department update', parseResult.error.format()));
    }

    const actorId = req.user?.userId;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const requestId = req.headers['x-request-id'] as string | undefined;

    const department = await departmentsService.updateDepartment(
      orgId,
      departmentId,
      parseResult.data,
      actorId,
      ipAddress,
      requestId
    );

    sendSuccess(res, department);
  } catch (error) {
    next(error);
  }
}

export async function deleteDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const { departmentId } = req.params;
    const actorId = req.user?.userId;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const requestId = req.headers['x-request-id'] as string | undefined;

    const result = await departmentsService.deleteDepartment(
      orgId,
      departmentId,
      actorId,
      ipAddress,
      requestId
    );

    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}
