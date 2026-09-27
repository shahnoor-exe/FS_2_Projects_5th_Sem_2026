import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
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
