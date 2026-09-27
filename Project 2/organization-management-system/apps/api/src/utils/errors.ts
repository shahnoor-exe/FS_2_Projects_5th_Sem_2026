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
  constructor(message = 'Insufficient permissions for this action', code: ErrorCodeType | string = ErrorCode.FORBIDDEN, details?: unknown) {
    super(message, 403, code, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code: ErrorCodeType | string = ErrorCode.NOT_FOUND, details?: unknown) {
    super(message, 404, code, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict detected', code: ErrorCodeType | string = ErrorCode.CONFLICT, details?: unknown) {
    super(message, 409, code, details);
  }
}

export class DatabaseUnavailableError extends AppError {
  constructor(message = 'Database is currently unreachable') {
    super(message, 503, ErrorCode.DATABASE_UNAVAILABLE);
  }
}

export class TenantMismatchError extends AppError {
  constructor(message = 'Token organization does not match requested tenant context') {
    super(message, 403, ErrorCode.TENANT_MISMATCH);
  }
}

export class AccountDeactivatedError extends AppError {
  constructor(message = 'User account has been deactivated') {
    super(message, 401, ErrorCode.ACCOUNT_DEACTIVATED);
  }
}

export class MembershipDeactivatedError extends AppError {
  constructor(message = 'Organization membership has been deactivated') {
    super(message, 403, ErrorCode.MEMBERSHIP_DEACTIVATED);
  }
}

export class OrganizationDeactivatedError extends AppError {
  constructor(message = 'Organization has been deactivated') {
    super(message, 403, ErrorCode.ORGANIZATION_DEACTIVATED);
  }
}

export class ConcurrentRefreshRaceError extends AppError {
  constructor(message = 'Token was already refreshed concurrently. Please use the replacement token.') {
    super(message, 409, ErrorCode.CONCURRENT_REFRESH_RACE);
  }
}

export class RateLimitExceededError extends AppError {
  constructor(message = 'Too many requests, please try again later', details?: unknown) {
    super(message, 429, ErrorCode.RATE_LIMITED, details);
  }
}
