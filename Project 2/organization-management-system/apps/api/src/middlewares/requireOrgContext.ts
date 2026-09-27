import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import {
  AuthenticationError,
  TenantMismatchError,
  AccountDeactivatedError,
  OrganizationDeactivatedError,
  MembershipDeactivatedError,
} from '../utils/errors.js';

export interface OrgContext {
  id: string;
  name: string;
  slug: string;
  role: {
    id: string;
    name: string;
    permissions: string[];
  };
}

declare global {
  namespace Express {
    interface Request {
      organization?: OrgContext;
    }
  }
}

/**
 * Enforces strict single-tenant binding and immediate active-status validation against PostgreSQL.
 */
export async function requireOrgContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const user = req.user;
  if (!user || !user.userId || !user.organizationId) {
    return next(new AuthenticationError('Authentication required with tenant-bound token'));
  }

  // 1. Verify tenant alignment: caller-supplied header or URL param must match token's organizationId
  const headerOrgId = req.headers['x-org-id'] as string | undefined;
  const paramOrgId = req.params.organizationId as string | undefined;

  if (headerOrgId && headerOrgId !== user.organizationId) {
    return next(
      new TenantMismatchError(
        `Token organization (${user.organizationId}) does not match x-org-id header (${headerOrgId})`
      )
    );
  }

  if (paramOrgId && paramOrgId !== user.organizationId) {
    return next(
      new TenantMismatchError(
        `Token organization (${user.organizationId}) does not match route organizationId parameter (${paramOrgId})`
      )
    );
  }

  try {
    // 2. Query PostgreSQL directly to verify immediate active status across all 3 tiers
    const membership = await prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.userId,
          organizationId: user.organizationId,
        },
      },
      include: {
        user: { select: { isActive: true } },
        organization: { select: { id: true, name: true, slug: true, isActive: true } },
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: { select: { action: true } },
              },
            },
          },
        },
      },
    });

    if (!membership) {
      return next(new MembershipDeactivatedError('No membership found for user in this organization'));
    }

    if (!membership.user.isActive) {
      return next(new AccountDeactivatedError('User account is currently deactivated'));
    }

    if (!membership.organization.isActive) {
      return next(new OrganizationDeactivatedError('Organization is currently deactivated'));
    }

    if (!membership.isActive) {
      return next(new MembershipDeactivatedError('User membership in this organization is deactivated'));
    }

    const permissions = membership.role.rolePermissions.map((rp) => rp.permission.action);

    req.organization = {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      role: {
        id: membership.role.id,
        name: membership.role.name,
        permissions,
      },
    };

    next();
  } catch (error) {
    next(error);
  }
}
