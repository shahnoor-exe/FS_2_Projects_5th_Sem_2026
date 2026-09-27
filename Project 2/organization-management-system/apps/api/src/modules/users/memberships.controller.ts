import { Request, Response, NextFunction } from 'express';
import { membershipsService } from './memberships.service.js';
import { sendSuccess } from '../../utils/response.js';
import {
  addMemberSchema,
  updateMemberRoleSchema,
  updateMemberStatusSchema,
  membershipQuerySchema,
} from '@orgsphere/shared';
import { ValidationError } from '../../utils/errors.js';

export async function listMemberships(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const parseResult = membershipQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return next(new ValidationError('Invalid membership query parameters', parseResult.error.format()));
    }

    const { data, meta } = await membershipsService.listMemberships(orgId, parseResult.data);
    sendSuccess(res, data, meta);
  } catch (error) {
    next(error);
  }
}

export async function getMembership(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const { membershipId } = req.params;
    const membership = await membershipsService.getMembership(orgId, membershipId);
    sendSuccess(res, membership);
  } catch (error) {
    next(error);
  }
}

export async function addMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const actorUserId = req.user!.userId;
    const parseResult = addMemberSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new ValidationError('Validation failed for adding member', parseResult.error.format()));
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const requestId = req.headers['x-request-id'] as string | undefined;

    const result = await membershipsService.addExistingMember(
      orgId,
      parseResult.data,
      actorUserId,
      ipAddress,
      requestId
    );

    sendSuccess(res, result, undefined, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateMemberRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const actorUserId = req.user!.userId;
    const { membershipId } = req.params;
    const parseResult = updateMemberRoleSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new ValidationError('Validation failed for member role update', parseResult.error.format()));
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const requestId = req.headers['x-request-id'] as string | undefined;

    const result = await membershipsService.updateMembershipRole(
      orgId,
      membershipId,
      parseResult.data,
      actorUserId,
      ipAddress,
      requestId
    );

    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function updateMemberStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const actorUserId = req.user!.userId;
    const { membershipId } = req.params;
    const parseResult = updateMemberStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new ValidationError('Validation failed for member status update', parseResult.error.format()));
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const requestId = req.headers['x-request-id'] as string | undefined;

    const result = await membershipsService.updateMembershipStatus(
      orgId,
      membershipId,
      parseResult.data,
      actorUserId,
      ipAddress,
      requestId
    );

    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}
