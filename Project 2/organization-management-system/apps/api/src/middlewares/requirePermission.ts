import { Request, Response, NextFunction } from 'express';
import { AuthorizationError } from '../utils/errors.js';

export function requirePermission(...requiredPermissions: string[]) {
  return function permissionMiddleware(req: Request, _res: Response, next: NextFunction): void {
    const userPermissions = req.organization?.role?.permissions || [];

    const hasAll = requiredPermissions.every((perm) => userPermissions.includes(perm));
    if (!hasAll) {
      return next(
        new AuthorizationError(`Missing required permission. Required: ${requiredPermissions.join(', ')}`)
      );
    }

    next();
  };
}
