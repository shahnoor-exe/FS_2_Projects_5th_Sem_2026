import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { AuthenticationError, AuthorizationError, AccountDeactivatedError } from '../utils/errors.js';
import { PlatformRole } from '@orgsphere/shared';

/**
 * Enforces platform-level administration authority.
 * Always queries current state directly from PostgreSQL rather than trusting a stale JWT claim.
 */
export async function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    return next(new AuthenticationError('Authentication required with platform privileges'));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { platformRole: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return next(new AccountDeactivatedError('User account is currently deactivated'));
    }

    if (user.platformRole !== PlatformRole.SUPER_ADMIN) {
      return next(new AuthorizationError('Platform administrator privileges required for this action'));
    }

    next();
  } catch (error) {
    next(error);
  }
}
