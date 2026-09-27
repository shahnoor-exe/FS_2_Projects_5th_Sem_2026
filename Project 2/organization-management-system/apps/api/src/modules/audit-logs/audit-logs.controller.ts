import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma.js';
import { sendSuccess } from '../../utils/response.js';
import { auditLogsQuerySchema, PaginationMeta } from '@orgsphere/shared';
import { ValidationError } from '../../utils/errors.js';

export async function listAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.organization!.id;
    const parseResult = auditLogsQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return next(new ValidationError('Invalid audit logs query parameters', parseResult.error.format()));
    }

    const { page, limit, sortBy, sortOrder, action, resourceType, startDate, endDate } = parseResult.data;
    const skip = (page - 1) * limit;

    const where = {
      organizationId: orgId,
      ...(action ? { action } : {}),
      ...(resourceType ? { resourceType } : {}),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate ? { lte: new Date(endDate) } : {}),
            },
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ [sortBy || 'createdAt']: sortOrder }, { id: 'asc' }],
        include: {
          actor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    const meta: PaginationMeta = {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };

    sendSuccess(res, items, meta);
  } catch (error) {
    next(error);
  }
}
