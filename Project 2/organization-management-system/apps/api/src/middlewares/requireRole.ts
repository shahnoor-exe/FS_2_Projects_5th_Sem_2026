import { Request, Response, NextFunction } from 'express';
import { AuthorizationError } from '../utils/errors.js';

export function requireRole(...allowedRoles: string[]) {
  return function roleMiddleware(req: Request, _res: Response, next: NextFunction): void {
    const roleName = req.organization?.role?.name;
    if (!roleName) {
      return next(new AuthorizationError('Organization context and role required'));
    }

    if (!allowedRoles.includes(roleName)) {
      return next(
        new AuthorizationError(`Role '${roleName}' is not authorized. Required one of: ${allowedRoles.join(', ')}`)
      );
    }

    next();
  };
}
