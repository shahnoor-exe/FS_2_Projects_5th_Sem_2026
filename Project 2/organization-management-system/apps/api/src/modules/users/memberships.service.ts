import { prisma } from '../../config/prisma.js';
import { recordAuditLog } from '../audit/audit.service.js';
import { cacheService } from '../../services/cache.service.js';
import {
  NotFoundError,
  ConflictError,
  AuthorizationError,
  AccountDeactivatedError,
  MembershipDeactivatedError,
} from '../../utils/errors.js';
import {
  AddMemberInput,
  UpdateMemberRoleInput,
  UpdateMemberStatusInput,
  MembershipQuery,
  PaginationMeta,
  SystemRole,
  PermissionAction,
  ErrorCode,
} from '@orgsphere/shared';

export const membershipsService = {
  async listMemberships(orgId: string, query: MembershipQuery) {
    const { page, limit, sortBy, sortOrder, roleId, isActive } = query;
    const skip = (page - 1) * limit;

    const where = {
      organizationId: orgId,
      ...(roleId ? { roleId } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    };

    const [total, items] = await Promise.all([
      prisma.organizationMembership.count({ where }),
      prisma.organizationMembership.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ [sortBy || 'createdAt']: sortOrder }, { id: 'asc' }],
        select: {
          id: true,
          userId: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          role: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
          user: {
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

    return { data: items, meta };
  },

  async getMembership(orgId: string, membershipId: string) {
    const membership = await prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId: orgId },
      select: {
        id: true,
        userId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!membership) {
      throw new NotFoundError('Membership not found');
    }

    return membership;
  },

  async addExistingMember(
    orgId: string,
    input: AddMemberInput,
    actorUserId: string,
    ipAddress?: string,
    requestId?: string
  ) {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Organization row lock serializes membership mutations in this tenant
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${orgId} FOR UPDATE`;

      // 2. Re-verify acting caller's active membership and authority inside tx
      const caller = await tx.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: actorUserId, organizationId: orgId } },
        include: {
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
            },
          },
        },
      });

      if (!caller || !caller.isActive) {
        throw new MembershipDeactivatedError('Caller membership is deactivated');
      }
      const callerPerms = caller.role.rolePermissions.map((rp) => rp.permission.action);
      if (!callerPerms.includes(PermissionAction.MEMBER_MANAGE)) {
        throw new AuthorizationError('Caller has lost member:manage authority');
      }

      // 3. Lookup user in PostgreSQL `users` table
      const user = await tx.user.findUnique({
        where: { email: input.email.toLowerCase() },
      });

      if (!user) {
        throw new NotFoundError(
          'User with specified email does not exist on OrgSphere',
          ErrorCode.USER_NOT_FOUND
        );
      }

      // Reject adding or reactivating an inactive user
      if (!user.isActive) {
        throw new AccountDeactivatedError(
          'User account is deactivated and cannot be added to an organization'
        );
      }

      // 4. Resolve requested role
      const targetRole = await tx.role.findUnique({
        where: { name: input.role },
      });
      if (!targetRole) {
        throw new NotFoundError(`Role '${input.role}' not found`);
      }

      // 5. Check if membership already exists in this organization
      const existingMembership = await tx.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: user.id, organizationId: orgId } },
      });

      if (existingMembership) {
        if (existingMembership.isActive) {
          throw new ConflictError(
            'User is already an active member of this organization',
            ErrorCode.MEMBERSHIP_ALREADY_EXISTS
          );
        }

        // Reactivate inactive membership with the new role
        const reactivated = await tx.organizationMembership.update({
          where: { id: existingMembership.id },
          data: {
            isActive: true,
            roleId: targetRole.id,
          },
          select: {
            id: true,
            userId: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
            role: { select: { id: true, name: true, description: true } },
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        });

        await recordAuditLog({
          organizationId: orgId,
          actorId: actorUserId,
          action: 'MEMBER_REACTIVATE',
          resourceType: 'OrganizationMembership',
          resourceId: reactivated.id,
          ipAddress,
          requestId,
          metadata: { email: user.email, role: input.role },
          tx,
        });

        return reactivated;
      }

      // Create new membership
      const created = await tx.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: orgId,
          roleId: targetRole.id,
          isActive: true,
        },
        select: {
          id: true,
          userId: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          role: { select: { id: true, name: true, description: true } },
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      await recordAuditLog({
        organizationId: orgId,
        actorId: actorUserId,
        action: 'MEMBER_ADD',
        resourceType: 'OrganizationMembership',
        resourceId: created.id,
        ipAddress,
        requestId,
        metadata: { email: user.email, role: input.role },
        tx,
      });

      return created;
    });

    await cacheService.bumpGeneration(orgId, 'dashboard');

    return result;
  },

  async updateMembershipRole(
    orgId: string,
    membershipId: string,
    input: UpdateMemberRoleInput,
    actorUserId: string,
    ipAddress?: string,
    requestId?: string
  ) {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Organization row lock
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${orgId} FOR UPDATE`;

      // 2. Re-verify acting caller's active status and authority
      const caller = await tx.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: actorUserId, organizationId: orgId } },
        include: {
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
            },
          },
        },
      });

      if (!caller || !caller.isActive) {
        throw new MembershipDeactivatedError('Caller membership is deactivated');
      }
      const callerPerms = caller.role.rolePermissions.map((rp) => rp.permission.action);
      if (!callerPerms.includes(PermissionAction.MEMBER_MANAGE)) {
        throw new AuthorizationError('Caller has lost member:manage authority');
      }

      // 3. Load target membership
      const target = await tx.organizationMembership.findFirst({
        where: { id: membershipId, organizationId: orgId },
        include: { role: true },
      });

      if (!target) {
        throw new NotFoundError('Membership not found');
      }

      // 4. Resolve new role
      const targetRole = await tx.role.findUnique({
        where: { name: input.role },
      });
      if (!targetRole) {
        throw new NotFoundError(`Role '${input.role}' not found`);
      }

      // 5. Sole-admin protection guard
      const isTargetActiveAdmin = target.isActive && target.role.name === SystemRole.ORG_ADMIN;
      const isLosingAdminRole = input.role !== SystemRole.ORG_ADMIN;

      if (isTargetActiveAdmin && isLosingAdminRole) {
        const activeAdminCount = await tx.organizationMembership.count({
          where: {
            organizationId: orgId,
            isActive: true,
            role: { name: SystemRole.ORG_ADMIN },
          },
        });

        if (activeAdminCount <= 1) {
          throw new ConflictError(
            'Cannot demote the organization’s sole active administrator',
            ErrorCode.LAST_ADMIN_PROTECTION
          );
        }
      }

      // 6. Update role
      const updated = await tx.organizationMembership.update({
        where: { id: membershipId },
        data: { roleId: targetRole.id },
        select: {
          id: true,
          userId: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          role: { select: { id: true, name: true, description: true } },
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      await recordAuditLog({
        organizationId: orgId,
        actorId: actorUserId,
        action: 'MEMBER_ROLE_UPDATE',
        resourceType: 'OrganizationMembership',
        resourceId: membershipId,
        ipAddress,
        requestId,
        metadata: {
          targetUserId: target.userId,
          previousRole: target.role.name,
          newRole: input.role,
        },
        tx,
      });

      return updated;
    });

    await cacheService.bumpGeneration(orgId, 'dashboard');

    return result;
  },

  async updateMembershipStatus(
    orgId: string,
    membershipId: string,
    input: UpdateMemberStatusInput,
    actorUserId: string,
    ipAddress?: string,
    requestId?: string
  ) {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Organization row lock
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${orgId} FOR UPDATE`;

      // 2. Re-verify acting caller's active status and authority
      const caller = await tx.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: actorUserId, organizationId: orgId } },
        include: {
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
            },
          },
        },
      });

      if (!caller || !caller.isActive) {
        throw new MembershipDeactivatedError('Caller membership is deactivated');
      }
      const callerPerms = caller.role.rolePermissions.map((rp) => rp.permission.action);
      if (!callerPerms.includes(PermissionAction.MEMBER_MANAGE)) {
        throw new AuthorizationError('Caller has lost member:manage authority');
      }

      // 3. Load target membership
      const target = await tx.organizationMembership.findFirst({
        where: { id: membershipId, organizationId: orgId },
        include: { role: true, user: true },
      });

      if (!target) {
        throw new NotFoundError('Membership not found');
      }

      // Reject activating an inactive base user
      if (input.isActive && !target.user.isActive) {
        throw new AccountDeactivatedError(
          'User account is deactivated and cannot be activated in an organization'
        );
      }

      // 4. Cannot deactivate self
      if (target.userId === actorUserId && input.isActive === false) {
        throw new ConflictError('Cannot deactivate own membership', ErrorCode.CONFLICT);
      }

      // 5. Sole-admin deactivation guard
      const isTargetActiveAdmin = target.isActive && target.role.name === SystemRole.ORG_ADMIN;
      if (isTargetActiveAdmin && input.isActive === false) {
        const activeAdminCount = await tx.organizationMembership.count({
          where: {
            organizationId: orgId,
            isActive: true,
            role: { name: SystemRole.ORG_ADMIN },
          },
        });

        if (activeAdminCount <= 1) {
          throw new ConflictError(
            'Cannot deactivate the organization’s sole active administrator',
            ErrorCode.LAST_ADMIN_PROTECTION
          );
        }
      }

      // 6. Update status
      const updated = await tx.organizationMembership.update({
        where: { id: membershipId },
        data: { isActive: input.isActive },
        select: {
          id: true,
          userId: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          role: { select: { id: true, name: true, description: true } },
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      // 7. If deactivating: revoke all refresh tokens for that (userId, organizationId)
      if (input.isActive === false) {
        await tx.refreshToken.updateMany({
          where: {
            userId: target.userId,
            organizationId: orgId,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
            revocationReason: 'MEMBERSHIP_DEACTIVATED',
          },
        });
      }

      await recordAuditLog({
        organizationId: orgId,
        actorId: actorUserId,
        action: 'MEMBER_STATUS_UPDATE',
        resourceType: 'OrganizationMembership',
        resourceId: membershipId,
        ipAddress,
        requestId,
        metadata: {
          targetUserId: target.userId,
          previousIsActive: target.isActive,
          newIsActive: input.isActive,
        },
        tx,
      });

      return updated;
    });

    await cacheService.bumpGeneration(orgId, 'dashboard');

    return result;
  },
};
