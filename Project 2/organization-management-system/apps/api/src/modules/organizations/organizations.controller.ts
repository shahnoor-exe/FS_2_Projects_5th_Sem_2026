import { Request, Response, NextFunction } from 'express';
import { organizationsService } from './organizations.service.js';
import { dashboardService } from './dashboard.service.js';
import { sendSuccess } from '../../utils/response.js';
import { updateOrganizationSchema } from '@orgsphere/shared';
import { ValidationError } from '../../utils/errors.js';

export async function getDashboardMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const { data, source } = await dashboardService.getMetrics(orgId);
    res.setHeader('X-Cache', source);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function getCurrentOrg(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const org = await organizationsService.getOrganization(orgId);
    sendSuccess(res, org);
  } catch (error) {
    next(error);
  }
}

export async function updateCurrentOrg(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const parseResult = updateOrganizationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new ValidationError('Validation failed for organization update', parseResult.error.format()));
    }

    const actorId = req.user?.userId;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const requestId = req.headers['x-request-id'] as string | undefined;

    const updated = await organizationsService.updateOrganization(
      orgId,
      parseResult.data,
      actorId,
      ipAddress,
      requestId
    );

    sendSuccess(res, updated);
  } catch (error) {
    next(error);
  }
}
