import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { generateAccessToken } from '../src/utils/token.js';
import { ensureSystemRoles } from '../src/utils/roles.js';
import { SystemRole } from '@orgsphere/shared';
import crypto from 'node:crypto';

describe('Unique Constraint Concurrency Integration Tests', () => {
  const app = createApp();
  const runId = crypto.randomUUID().slice(0, 8);

  const trackedUserIds = new Set<string>();
  const trackedOrgIds = new Set<string>();

  let orgIdA: string;
  let orgIdB: string;
  let adminTokenA: string;
  let adminTokenB: string;

  async function cleanup() {
    try {
      if (trackedOrgIds.size > 0) {
        await prisma.auditLog.deleteMany({ where: { organizationId: { in: Array.from(trackedOrgIds) } } });
        await prisma.department.deleteMany({ where: { organizationId: { in: Array.from(trackedOrgIds) } } });
        await prisma.refreshToken.deleteMany({ where: { organizationId: { in: Array.from(trackedOrgIds) } } });
        await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: Array.from(trackedOrgIds) } } });
        await prisma.organization.deleteMany({ where: { id: { in: Array.from(trackedOrgIds) } } });
      }
      if (trackedUserIds.size > 0) {
        await prisma.user.deleteMany({ where: { id: { in: Array.from(trackedUserIds) } } });
      }
    } catch (err) {
      console.warn('Cleanup warning:', err);
    }
  }

  beforeAll(async () => {
    const roles = await ensureSystemRoles();
    const adminRoleId = roles[SystemRole.ORG_ADMIN].id;

    // Create Org A
    const orgA = await prisma.organization.create({
      data: { name: `Org A ${runId}`, slug: `unique-org-a-${runId}`, isActive: true },
    });
    orgIdA = orgA.id;
    trackedOrgIds.add(orgIdA);

    const userA = await prisma.user.create({
      data: {
        email: `admin-a-${runId}@orgsphere.test`,
        passwordHash: 'dummy_hash',
        firstName: 'Admin',
        lastName: 'A',
        isActive: true,
      },
    });
    trackedUserIds.add(userA.id);

    await prisma.organizationMembership.create({
      data: { userId: userA.id, organizationId: orgIdA, roleId: adminRoleId, isActive: true },
    });

    adminTokenA = generateAccessToken({
      userId: userA.id,
      email: userA.email,
      organizationId: orgIdA,
      roleId: adminRoleId,
      platformRole: 'USER',
    });

    // Create Org B
    const orgB = await prisma.organization.create({
      data: { name: `Org B ${runId}`, slug: `unique-org-b-${runId}`, isActive: true },
    });
    orgIdB = orgB.id;
    trackedOrgIds.add(orgIdB);

    const userB = await prisma.user.create({
      data: {
        email: `admin-b-${runId}@orgsphere.test`,
        passwordHash: 'dummy_hash',
        firstName: 'Admin',
        lastName: 'B',
        isActive: true,
      },
    });
    trackedUserIds.add(userB.id);

    await prisma.organizationMembership.create({
      data: { userId: userB.id, organizationId: orgIdB, roleId: adminRoleId, isActive: true },
    });

    adminTokenB = generateAccessToken({
      userId: userB.id,
      email: userB.email,
      organizationId: orgIdB,
      roleId: adminRoleId,
      platformRole: 'USER',
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it('races concurrent department creation with duplicate name: one succeeds (201) and one conflicts (409)', async () => {
    const targetDeptName = `Engineering ${runId}`;

    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/v1/departments')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: targetDeptName }),
      request(app)
        .post('/api/v1/departments')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ name: targetDeptName }),
    ]);

    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(201);
    expect(statuses).toContain(409);

    const conflictRes = res1.status === 409 ? res1 : res2;
    expect(conflictRes.body.error.code).toBe('DEPARTMENT_NAME_EXISTS');

    // Confirm database has exactly one row
    const depts = await prisma.department.findMany({
      where: { organizationId: orgIdA, name: targetDeptName },
    });
    expect(depts.length).toBe(1);
  });

  it('races concurrent slug update between two organizations: one succeeds (200) and one conflicts (409)', async () => {
    const targetSlug = `contended-slug-${runId}`;

    const [resA, resB] = await Promise.all([
      request(app)
        .patch('/api/v1/organizations/current')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .send({ slug: targetSlug }),
      request(app)
        .patch('/api/v1/organizations/current')
        .set('Authorization', `Bearer ${adminTokenB}`)
        .send({ slug: targetSlug }),
    ]);

    const statuses = [resA.status, resB.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);

    const conflictRes = resA.status === 409 ? resA : resB;
    expect(conflictRes.body.error.code).toBe('SLUG_ALREADY_EXISTS');

    // Confirm database has exactly one organization with targetSlug
    const orgs = await prisma.organization.findMany({
      where: { slug: targetSlug },
    });
    expect(orgs.length).toBe(1);
  });
});
