import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiErrorResponse, ErrorCode } from '@orgsphere/shared';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): Response {
  const requestId = typeof req.id === 'string' ? req.id : String(req.id || '');

  // Handle known AppError instances
  if (err instanceof AppError) {
    logger.warn({ err, requestId, code: err.code }, err.message);
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
        requestId,
        ...(env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
      },
    };
    return res.status(err.statusCode).json(response);
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    logger.warn({ issues: err.issues, requestId }, 'Request validation failed');
    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid request data provided',
        details: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
        requestId,
        ...(env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
      },
    };
    return res.status(400).json(response);
  }

  // Handle Prisma Known Request Errors (e.g. P2002 Unique Constraint, P2003 Foreign Key)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target)
        ? (err.meta?.target as string[]).join('_')
        : String(err.meta?.target || '');

      let code: string = ErrorCode.CONFLICT;
      let message = 'A unique constraint violation occurred.';

      if (target.includes('slug')) {
        code = ErrorCode.SLUG_ALREADY_EXISTS;
        message = 'Organization slug is already in use.';
      } else if (target.includes('name') || target.includes('organization_id_name')) {
        code = ErrorCode.DEPARTMENT_NAME_EXISTS;
        message = 'A department with this name already exists in this organization.';
      } else if (target.includes('user_id') || target.includes('membership')) {
        code = ErrorCode.MEMBERSHIP_ALREADY_EXISTS;
        message = 'User is already a member of this organization.';
      }

      logger.warn({ err, requestId, code, target }, message);
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code,
          message,
          requestId,
          ...(env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
        },
      };
      return res.status(409).json(response);
    }

    if (err.code === 'P2003') {
      logger.warn({ err, requestId }, 'Foreign key constraint violated');
      const response: ApiErrorResponse = {
        success: false,
        error: {
          code: ErrorCode.CONFLICT,
          message: 'Referenced entity does not exist or relational boundary constraint violated.',
          requestId,
          ...(env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
        },
      };
      return res.status(409).json(response);
    }
  }

  // Unhandled / Internal Server Errors
  logger.error({ err, requestId }, 'Unhandled application exception');
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected internal server error occurred',
      requestId,
      ...(env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    },
  };
  return res.status(500).json(response);
}
