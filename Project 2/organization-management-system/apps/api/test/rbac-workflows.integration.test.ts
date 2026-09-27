import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { generateAccessToken } from '../src/utils/token.js';
import { ensureSystemRoles } from '../src/utils/roles.js';
import { SystemRole } from '@orgsphere/shared';
import crypto from 'node:crypto';

describe('RBAC Workflows & Employee Self-Update Restriction Integration Tests', () => {
  const app = createApp();
  const runId = crypto.randomUUID().slice(0, 8);

  const trackedUserIds = new Set<string>();
  const trackedOrgIds = new Set<string>();

  let orgId: string;
  let adminToken: string;
  let managerToken: string;
  let employee1Token: string;
  let employee1UserId: string;
  let employee2Token: string;
  let employee2UserId: string;
  let viewerToken: string;

  let testProjectId: string;
  let employee1TaskId: string;
  let employee2TaskId: string;

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
    const managerRoleId = roles[SystemRole.MANAGER].id;
    const employeeRoleId = roles[SystemRole.EMPLOYEE].id;
    const viewerRoleId = roles[SystemRole.VIEWER].id;

    // Create organization
    const org = await prisma.organization.create({
      data: { name: `RBAC Org ${runId}`, slug: `rbac-${runId}`, isActive: true },
    });
    orgId = org.id;
    trackedOrgIds.add(orgId);

    // Create Admin
    const adminUser = await prisma.user.create({
      data: { email: `admin-${runId}@orgsphere.test`, passwordHash: 'hash', firstName: 'Admin', lastName: 'User', isActive: true },
    });
    trackedUserIds.add(adminUser.id);
    await prisma.organizationMembership.create({
      data: { userId: adminUser.id, organizationId: orgId, roleId: adminRoleId, isActive: true },
    });
    adminToken = generateAccessToken({ userId: adminUser.id, email: adminUser.email, organizationId: orgId, roleId: adminRoleId, platformRole: 'USER' });

    // Create Manager
    const mgrUser = await prisma.user.create({
      data: { email: `mgr-${runId}@orgsphere.test`, passwordHash: 'hash', firstName: 'Mgr', lastName: 'User', isActive: true },
    });
    trackedUserIds.add(mgrUser.id);
    await prisma.organizationMembership.create({
      data: { userId: mgrUser.id, organizationId: orgId, roleId: managerRoleId, isActive: true },
    });
    managerToken = generateAccessToken({ userId: mgrUser.id, email: mgrUser.email, organizationId: orgId, roleId: managerRoleId, platformRole: 'USER' });

    // Create Employee 1
    const emp1User = await prisma.user.create({
      data: { email: `emp1-${runId}@orgsphere.test`, passwordHash: 'hash', firstName: 'Emp1', lastName: 'User', isActive: true },
    });
    employee1UserId = emp1User.id;
    trackedUserIds.add(employee1UserId);
    await prisma.organizationMembership.create({
      data: { userId: employee1UserId, organizationId: orgId, roleId: employeeRoleId, isActive: true },
    });
    employee1Token = generateAccessToken({ userId: employee1UserId, email: emp1User.email, organizationId: orgId, roleId: employeeRoleId, platformRole: 'USER' });

    // Create Employee 2
    const emp2User = await prisma.user.create({
      data: { email: `emp2-${runId}@orgsphere.test`, passwordHash: 'hash', firstName: 'Emp2', lastName: 'User', isActive: true },
    });
    employee2UserId = emp2User.id;
    trackedUserIds.add(employee2UserId);
    await prisma.organizationMembership.create({
      data: { userId: employee2UserId, organizationId: orgId, roleId: employeeRoleId, isActive: true },
    });
    employee2Token = generateAccessToken({ userId: employee2UserId, email: emp2User.email, organizationId: orgId, roleId: employeeRoleId, platformRole: 'USER' });

    // Create Viewer
    const viewerUser = await prisma.user.create({
      data: { email: `viewer-${runId}@orgsphere.test`, passwordHash: 'hash', firstName: 'Viewer', lastName: 'User', isActive: true },
    });
    trackedUserIds.add(viewerUser.id);
    await prisma.organizationMembership.create({
      data: { userId: viewerUser.id, organizationId: orgId, roleId: viewerRoleId, isActive: true },
    });
    viewerToken = generateAccessToken({ userId: viewerUser.id, email: viewerUser.email, organizationId: orgId, roleId: viewerRoleId, platformRole: 'USER' });

    // Create initial Project and Tasks
    const project = await prisma.project.create({
      data: { name: `RBAC Project ${runId}`, organizationId: orgId },
    });
    testProjectId = project.id;

    const task1 = await prisma.task.create({
      data: { title: `Task For Emp1 ${runId}`, organizationId: orgId, projectId: testProjectId, assigneeId: employee1UserId },
    });
    employee1TaskId = task1.id;

    const task2 = await prisma.task.create({
      data: { title: `Task For Emp2 ${runId}`, organizationId: orgId, projectId: testProjectId, assigneeId: employee2UserId },
    });
    employee2TaskId = task2.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('allows Manager to create a project, but forbids Employee from creating a project', async () => {
    // 1. Employee attempt -> MUST return 403 Forbidden
    const empRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${employee1Token}`)
      .send({ name: `Illegal Emp Project ${runId}` });
    expect(empRes.status).toBe(403);

    // 2. Manager attempt -> MUST succeed (201 Created)
    const mgrRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: `Manager Project ${runId}` });
    expect(mgrRes.status).toBe(201);
    expect(mgrRes.body.data.name).toBe(`Manager Project ${runId}`);
  });

  it('enforces Employee restricted task self-update: can update status of own assigned task', async () => {
    const res = await request(app)
      .patch(`/api/v1/tasks/${employee1TaskId}`)
      .set('Authorization', `Bearer ${employee1Token}`)
      .send({ status: 'IN_PROGRESS', description: 'Working on it' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('IN_PROGRESS');
    expect(res.body.data.description).toBe('Working on it');
  });

  it('rejects Employee attempt to update task assigned to someone else (403)', async () => {
    // Employee 1 attempts to update Employee 2's task
    const res = await request(app)
      .patch(`/api/v1/tasks/${employee2TaskId}`)
      .set('Authorization', `Bearer ${employee1Token}`)
      .send({ status: 'DONE' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN_NOT_ASSIGNED_TASK');
  });

  it('rejects Employee attempt to update forbidden fields like title or assigneeId (403)', async () => {
    // Employee 1 attempts to change title of own assigned task
    const res = await request(app)
      .patch(`/api/v1/tasks/${employee1TaskId}`)
      .set('Authorization', `Bearer ${employee1Token}`)
      .send({ title: 'New Unauthorized Title' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN_FIELD_UPDATE');
  });

  it('proves atomic conditional update: when manager reassigns task, employee update fails immediately', async () => {
    // 1. Manager reassigns Employee 1's task to Employee 2
    await request(app)
      .patch(`/api/v1/tasks/${employee1TaskId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ assigneeId: employee2UserId });

    // 2. Employee 1 attempts to update the now-reassigned task
    const res = await request(app)
      .patch(`/api/v1/tasks/${employee1TaskId}`)
      .set('Authorization', `Bearer ${employee1Token}`)
      .send({ status: 'DONE' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_NOT_ASSIGNED_TASK');
  });

  it('forbids Viewer from all mutations (403)', async () => {
    const res = await request(app)
      .patch(`/api/v1/tasks/${employee2TaskId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ status: 'DONE' });

    expect(res.status).toBe(403);
  });
});
