import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../config/prisma.js';
import { SystemRole, PermissionAction, SystemRoleType, PermissionActionType } from '@orgsphere/shared';

export const ROLE_PERMISSIONS: Record<SystemRoleType, PermissionActionType[]> = {
  [SystemRole.ORG_ADMIN]: [
    PermissionAction.ORG_MANAGE,
    PermissionAction.ORG_READ,
    PermissionAction.DEPT_MANAGE,
    PermissionAction.DEPT_READ,
    PermissionAction.MEMBER_MANAGE,
    PermissionAction.MEMBER_READ,
    PermissionAction.PROJECT_MANAGE,
    PermissionAction.PROJECT_READ,
    PermissionAction.TASK_MANAGE,
    PermissionAction.TASK_READ,
    PermissionAction.TASK_UPDATE_ASSIGNED,
    PermissionAction.AUDIT_READ,
  ],
  [SystemRole.MANAGER]: [
    PermissionAction.ORG_READ,
    PermissionAction.DEPT_READ,
    PermissionAction.MEMBER_READ,
    PermissionAction.PROJECT_MANAGE,
    PermissionAction.PROJECT_READ,
    PermissionAction.TASK_MANAGE,
    PermissionAction.TASK_READ,
    PermissionAction.TASK_UPDATE_ASSIGNED,
  ],
  [SystemRole.EMPLOYEE]: [
    PermissionAction.ORG_READ,
    PermissionAction.DEPT_READ,
    PermissionAction.MEMBER_READ,
    PermissionAction.PROJECT_READ,
    PermissionAction.TASK_READ,
    PermissionAction.TASK_UPDATE_ASSIGNED,
  ],
  [SystemRole.VIEWER]: [
    PermissionAction.ORG_READ,
    PermissionAction.DEPT_READ,
    PermissionAction.MEMBER_READ,
    PermissionAction.PROJECT_READ,
    PermissionAction.TASK_READ,
  ],
};

const ROLE_DESCRIPTIONS: Record<SystemRoleType, string> = {
  [SystemRole.ORG_ADMIN]: 'Organization Administrator with full tenant access',
  [SystemRole.MANAGER]: 'Manager with project and task oversight',
  [SystemRole.EMPLOYEE]: 'Standard employee with assigned task access',
  [SystemRole.VIEWER]: 'Read-only viewer across the organization',
};

/**
 * Ensures all 4 system roles, 12 permissions, and mappings exist in PostgreSQL.
 * Uses atomic ON CONFLICT DO NOTHING to prevent race conditions during parallel test runs.
 */
export async function ensureSystemRoles(
  db: PrismaClient | Prisma.TransactionClient = defaultPrisma
): Promise<Record<SystemRoleType, { id: string; name: string }>> {
  // 1. Ensure all 12 permissions exist
  for (const action of Object.values(PermissionAction)) {
    await db.$executeRaw`
      INSERT INTO permissions (id, action, description, created_at, updated_at)
      VALUES (gen_random_uuid(), ${action}, ${`Permission to ${action}`}, NOW(), NOW())
      ON CONFLICT (action) DO NOTHING
    `;
  }

  const allPerms = await db.permission.findMany();
  const permissionMap = new Map<string, string>(allPerms.map((p) => [p.action, p.id]));

  // 2. Ensure all 4 system roles exist
  for (const roleName of Object.keys(ROLE_PERMISSIONS)) {
    await db.$executeRaw`
      INSERT INTO roles (id, name, description, is_system_role, created_at, updated_at)
      VALUES (gen_random_uuid(), ${roleName}, ${ROLE_DESCRIPTIONS[roleName as SystemRoleType]}, true, NOW(), NOW())
      ON CONFLICT (name) DO UPDATE SET is_system_role = true
    `;
  }

  const allRoles = await db.role.findMany({
    where: { name: { in: Object.keys(ROLE_PERMISSIONS) } },
  });
  const roleMap = new Map<string, { id: string; name: string }>(allRoles.map((r) => [r.name, { id: r.id, name: r.name }]));

  // 3. Link permissions to roles
  for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS) as [SystemRoleType, PermissionActionType[]][]) {
    const roleInfo = roleMap.get(roleName);
    if (!roleInfo) continue;

    for (const action of permissions) {
      const permissionId = permissionMap.get(action);
      if (permissionId) {
        await db.$executeRaw`
          INSERT INTO role_permissions (id, role_id, permission_id)
          VALUES (gen_random_uuid(), ${roleInfo.id}, ${permissionId})
          ON CONFLICT (role_id, permission_id) DO NOTHING
        `;
      }
    }
  }

  return {
    [SystemRole.ORG_ADMIN]: roleMap.get(SystemRole.ORG_ADMIN)!,
    [SystemRole.MANAGER]: roleMap.get(SystemRole.MANAGER)!,
    [SystemRole.EMPLOYEE]: roleMap.get(SystemRole.EMPLOYEE)!,
    [SystemRole.VIEWER]: roleMap.get(SystemRole.VIEWER)!,
  };
}
