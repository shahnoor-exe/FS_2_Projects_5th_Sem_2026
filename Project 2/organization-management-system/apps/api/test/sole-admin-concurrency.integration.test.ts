import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { generateAccessToken } from '../src/utils/token.js';
import { ensureSystemRoles } from '../src/utils/roles.js';
import { SystemRole } from '@orgsphere/shared';
import crypto from 'node:crypto';

describe('Sole-Admin Concurrency & Lockout Protection Integration Tests', () => {
  const app = createApp();
  const runId = crypto.randomUUID().slice(0, 8);

  const trackedUserIds = new Set<string>();
  const trackedOrgIds = new Set<string>();
  const trackedAuditLogIds = new Set<string>();

  let orgId: string;
  let adminRoleId: string;
  let employeeRoleId: string;

  let admin1UserId: string;
  let admin1MembershipId: string;
  let admin1Token: string;

  let admin2UserId: string;
  let admin2MembershipId: string;
  let admin2Token: string;

  async function cleanup() {
    try {
      if (trackedAuditLogIds.size > 0 || trackedOrgIds.size > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            OR: [
              { id: { in: Array.from(trackedAuditLogIds) } },
              { organizationId: { in: Array.from(trackedOrgIds) } },
            ],
          },
        });
      }
      if (trackedUserIds.size > 0 || trackedOrgIds.size > 0) {
        await prisma.refreshToken.deleteMany({
          where: {
            OR: [
              { userId: { in: Array.from(trackedUserIds) } },
              { organizationId: { in: Array.from(trackedOrgIds) } },
            ],
          },
        });
        await prisma.organizationMembership.deleteMany({
          where: {
            OR: [
              { userId: { in: Array.from(trackedUserIds) } },
              { organizationId: { in: Array.from(trackedOrgIds) } },
            ],
          },
        });
        await prisma.task.deleteMany({ where: { organizationId: { in: Array.from(trackedOrgIds) } } });
        await prisma.project.deleteMany({ where: { organizationId: { in: Array.from(trackedOrgIds) } } });
        await prisma.department.deleteMany({ where: { organizationId: { in: Array.from(trackedOrgIds) } } });
        await prisma.organization.deleteMany({ where: { id: { in: Array.from(trackedOrgIds) } } });
        await prisma.user.deleteMany({ where: { id: { in: Array.from(trackedUserIds) } } });
      }
    } catch (err) {
      console.warn('Cleanup warning:', err);
    }
  }

  beforeAll(async () => {
    // 1. Ensure system roles exist
    const roles = await ensureSystemRoles();
    adminRoleId = roles[SystemRole.ORG_ADMIN].id;
    employeeRoleId = roles[SystemRole.EMPLOYEE].id;

    // 2. Create test Organization
    const org = await prisma.organization.create({
      data: {
        name: `SoleAdmin Org ${runId}`,
        slug: `sole-admin-${runId}`,
        isActive: true,
      },
    });
    orgId = org.id;
    trackedOrgIds.add(orgId);

    // 3. Create Admin 1 User & Membership
    const user1 = await prisma.user.create({
      data: {
        email: `admin1-${runId}@orgsphere.test`,
        passwordHash: 'dummy_hash',
        firstName: 'Admin',
        lastName: 'One',
        isActive: true,
      },
    });
    admin1UserId = user1.id;
    trackedUserIds.add(admin1UserId);

    const mem1 = await prisma.organizationMembership.create({
      data: {
        userId: admin1UserId,
        organizationId: orgId,
        roleId: adminRoleId,
        isActive: true,
      },
    });
    admin1MembershipId = mem1.id;
    admin1Token = generateAccessToken({
      userId: admin1UserId,
      email: user1.email,
      organizationId: orgId,
      roleId: adminRoleId,
      platformRole: 'USER',
    });

    // 4. Create Admin 2 User & Membership
    const user2 = await prisma.user.create({
      data: {
        email: `admin2-${runId}@orgsphere.test`,
        passwordHash: 'dummy_hash',
        firstName: 'Admin',
        lastName: 'Two',
        isActive: true,
      },
    });
    admin2UserId = user2.id;
    trackedUserIds.add(admin2UserId);

    const mem2 = await prisma.organizationMembership.create({
      data: {
        userId: admin2UserId,
        organizationId: orgId,
        roleId: adminRoleId,
        isActive: true,
      },
    });
    admin2MembershipId = mem2.id;
    admin2Token = generateAccessToken({
      userId: admin2UserId,
      email: user2.email,
      organizationId: orgId,
      roleId: adminRoleId,
      platformRole: 'USER',
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it('rejects self-deactivation attempt by an administrator', async () => {
    const res = await request(app)
      .patch(`/api/v1/memberships/${admin1MembershipId}/status`)
      .set('Authorization', `Bearer ${admin1Token}`)
      .send({ isActive: false });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Cannot deactivate own membership');
  });

  it('prevents sole-admin demotion race: when two admins demote each other simultaneously, exactly one succeeds and one admin remains', async () => {
    // Both Admin 1 and Admin 2 issue concurrent demotions targeting the other
    const [res1, res2] = await Promise.all([
      request(app)
        .patch(`/api/v1/memberships/${admin2MembershipId}/role`)
        .set('Authorization', `Bearer ${admin1Token}`)
        .send({ role: SystemRole.EMPLOYEE }),
      request(app)
        .patch(`/api/v1/memberships/${admin1MembershipId}/role`)
        .set('Authorization', `Bearer ${admin2Token}`)
        .send({ role: SystemRole.EMPLOYEE }),
    ]);

    const statuses = [res1.status, res2.status];

    // Assert: exactly one request succeeded (200 OK)
    expect(statuses.filter((s) => s === 200).length).toBe(1);

    // The losing request must have been rejected with 403 (lost authority inside lock) or 409 (sole admin protection)
    const losingStatus = statuses.find((s) => s !== 200);
    expect([403, 409]).toContain(losingStatus);

    // Check database state directly in PostgreSQL: EXACTLY ONE active ORG_ADMIN must remain!
    const activeAdmins = await prisma.organizationMembership.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        role: { name: SystemRole.ORG_ADMIN },
      },
    });

    expect(activeAdmins.length).toBe(1);
  });

  it('rejects demoting the last remaining active administrator', async () => {
    // Identify the remaining admin
    const remainingAdmin = await prisma.organizationMembership.findFirstOrThrow({
      where: {
        organizationId: orgId,
        isActive: true,
        role: { name: SystemRole.ORG_ADMIN },
      },
      include: { user: true },
    });

    const token = generateAccessToken({
      userId: remainingAdmin.userId,
      email: remainingAdmin.user.email,
      organizationId: orgId,
      roleId: adminRoleId,
      platformRole: 'USER',
    });

    // Attempt to demote the sole remaining admin to EMPLOYEE
    const res = await request(app)
      .patch(`/api/v1/memberships/${remainingAdmin.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: SystemRole.EMPLOYEE });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('LAST_ADMIN_PROTECTION');
    expect(res.body.error.message).toContain('sole active administrator');

    // Confirm admin is still ORG_ADMIN in DB
    const adminCheck = await prisma.organizationMembership.findUniqueOrThrow({
      where: { id: remainingAdmin.id },
      include: { role: true },
    });
    expect(adminCheck.role.name).toBe(SystemRole.ORG_ADMIN);
  });
});
