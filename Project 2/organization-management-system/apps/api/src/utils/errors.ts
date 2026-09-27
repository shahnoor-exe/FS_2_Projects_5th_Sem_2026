import { ErrorCode, ErrorCodeType } from '@orgsphere/shared';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCodeType | string;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, code: ErrorCodeType | string = ErrorCode.INTERNAL_ERROR, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, ErrorCode.UNAUTHENTICATED);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions for this action') {
    super(message, 403, ErrorCode.FORBIDDEN);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, ErrorCode.NOT_FOUND);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict detected') {
    super(message, 409, ErrorCode.CONFLICT);
  }
}

export class DatabaseUnavailableError extends AppError {
  constructor(message = 'Database is currently unreachable') {
    super(message, 503, ErrorCode.DATABASE_UNAVAILABLE);
  }
}
