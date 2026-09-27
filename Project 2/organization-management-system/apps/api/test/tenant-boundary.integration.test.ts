import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { generateAccessToken } from '../src/utils/token.js';
import { ensureSystemRoles } from '../src/utils/roles.js';
import { SystemRole } from '@orgsphere/shared';
import crypto from 'node:crypto';

describe('Multi-Tenant Boundary & Non-Enumeration Integration Tests', () => {
  const app = createApp();
  const runId = crypto.randomUUID().slice(0, 8);

  const trackedUserIds = new Set<string>();
  const trackedOrgIds = new Set<string>();

  let orgIdA: string;
  let adminTokenA: string;
  let deptAId: string;
  let projAId: string;
  let taskAId: string;
  let membershipAId: string;

  let orgIdB: string;
  let adminTokenB: string;
  let userBId: string;
  let deptBId: string;
  let projBId: string;
  let taskBId: string;
  let membershipBId: string;

  async function cleanup() {
    try {
      if (trackedOrgIds.size > 0) {
        await prisma.auditLog.deleteMany({ where: { organizationId: { in: Array.from(trackedOrgIds) } } });
        await prisma.task.deleteMany({ where: { organizationId: { in: Array.from(trackedOrgIds) } } });
        await prisma.project.deleteMany({ where: { organizationId: { in: Array.from(trackedOrgIds) } } });
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

    // 1. Setup Tenant Alpha
    const orgA = await prisma.organization.create({
      data: { name: `Tenant Alpha ${runId}`, slug: `alpha-${runId}`, isActive: true },
    });
    orgIdA = orgA.id;
    trackedOrgIds.add(orgIdA);

    const userA = await prisma.user.create({
      data: { email: `alpha-admin-${runId}@orgsphere.test`, passwordHash: 'hash', firstName: 'Alpha', lastName: 'Admin', isActive: true },
    });
    trackedUserIds.add(userA.id);

    const memA = await prisma.organizationMembership.create({
      data: { userId: userA.id, organizationId: orgIdA, roleId: adminRoleId, isActive: true },
    });
    membershipAId = memA.id;
    adminTokenA = generateAccessToken({ userId: userA.id, email: userA.email, organizationId: orgIdA, roleId: adminRoleId, platformRole: 'USER' });

    const deptA = await prisma.department.create({
      data: { name: `Alpha Dept ${runId}`, organizationId: orgIdA },
    });
    deptAId = deptA.id;

    const projA = await prisma.project.create({
      data: { name: `Alpha Project ${runId}`, organizationId: orgIdA, departmentId: deptA.id },
    });
    projAId = projA.id;

    const taskA = await prisma.task.create({
      data: { title: `Alpha Task ${runId}`, organizationId: orgIdA, projectId: projA.id },
    });
    taskAId = taskA.id;

    // 2. Setup Tenant Beta
    const orgB = await prisma.organization.create({
      data: { name: `Tenant Beta ${runId}`, slug: `beta-${runId}`, isActive: true },
    });
    orgIdB = orgB.id;
    trackedOrgIds.add(orgIdB);

    const userB = await prisma.user.create({
      data: { email: `beta-admin-${runId}@orgsphere.test`, passwordHash: 'hash', firstName: 'Beta', lastName: 'Admin', isActive: true },
    });
    userBId = userB.id;
    trackedUserIds.add(userB.id);

    const memB = await prisma.organizationMembership.create({
      data: { userId: userB.id, organizationId: orgIdB, roleId: adminRoleId, isActive: true },
    });
    membershipBId = memB.id;
    adminTokenB = generateAccessToken({ userId: userB.id, email: userB.email, organizationId: orgIdB, roleId: adminRoleId, platformRole: 'USER' });

    const deptB = await prisma.department.create({
      data: { name: `Beta Dept ${runId}`, organizationId: orgIdB },
    });
    deptBId = deptB.id;

    const projB = await prisma.project.create({
      data: { name: `Beta Project ${runId}`, organizationId: orgIdB, departmentId: deptB.id },
    });
    projBId = projB.id;

    const taskB = await prisma.task.create({
      data: { title: `Beta Task ${runId}`, organizationId: orgIdB, projectId: projB.id },
    });
    taskBId = taskB.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('enforces non-enumeration: Tenant Alpha querying Tenant Beta department returns 404 Not Found (not 403)', async () => {
    const res = await request(app)
      .get(`/api/v1/departments/${deptBId}`)
      .set('Authorization', `Bearer ${adminTokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('enforces non-enumeration: Tenant Alpha querying Tenant Beta project returns 404 Not Found', async () => {
    const res = await request(app)
      .get(`/api/v1/projects/${projBId}`)
      .set('Authorization', `Bearer ${adminTokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('enforces non-enumeration: Tenant Alpha querying Tenant Beta task returns 404 Not Found', async () => {
    const res = await request(app)
      .get(`/api/v1/tasks/${taskBId}`)
      .set('Authorization', `Bearer ${adminTokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('enforces non-enumeration: Tenant Alpha querying Tenant Beta membership returns 404 Not Found', async () => {
    const res = await request(app)
      .get(`/api/v1/memberships/${membershipBId}`)
      .set('Authorization', `Bearer ${adminTokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects cross-tenant linking: Tenant Alpha attempting to link project to Tenant Beta department returns 404', async () => {
    const res = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({
        name: `Cross-Tenant Project ${runId}`,
        departmentId: deptBId, // Belongs to Tenant Beta!
      });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain('Department not found in this organization');
  });

  it('rejects cross-tenant assignment: Tenant Alpha attempting to assign task to Tenant Beta user returns 404', async () => {
    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({
        title: `Cross-Tenant Task ${runId}`,
        projectId: projAId,
        assigneeId: userBId, // Member only in Tenant Beta!
      });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain('Assignee must be an active member of this organization');
  });
});
