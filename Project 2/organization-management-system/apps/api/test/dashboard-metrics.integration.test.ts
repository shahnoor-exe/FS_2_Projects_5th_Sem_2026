import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { redis } from '../src/config/redis.js';
import { generateAccessToken } from '../src/utils/token.js';
import { ensureSystemRoles } from '../src/utils/roles.js';
import { SystemRole } from '@orgsphere/shared';

describe('Organization Dashboard Metrics Integration Tests', () => {
  const app = createApp();
  const runId = crypto.randomUUID().slice(0, 8);

  const trackedUserIds = new Set<string>();
  const trackedOrgIds = new Set<string>();

  let orgIdA: string;
  let orgIdB: string;
  let adminTokenA: string;
  let viewerTokenA: string;

  async function cleanup() {
    try {
      if (trackedOrgIds.size > 0) {
        const orgIds = Array.from(trackedOrgIds);
        await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
        await prisma.task.deleteMany({ where: { organizationId: { in: orgIds } } });
        await prisma.project.deleteMany({ where: { organizationId: { in: orgIds } } });
        await prisma.department.deleteMany({ where: { organizationId: { in: orgIds } } });
        await prisma.refreshToken.deleteMany({ where: { organizationId: { in: orgIds } } });
        await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: orgIds } } });
        await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });

        // Clean Redis keys for tested organizations
        if (redis && redis.status === 'ready') {
          for (const oid of orgIds) {
            const keys = await redis.keys(`org:${oid}:*`);
            if (keys.length > 0) {
              await redis.del(...keys);
            }
          }
        }
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

    // Create Tenant A
    const orgA = await prisma.organization.create({
      data: { name: `Dashboard Org A ${runId}`, slug: `dash-a-${runId}`, isActive: true },
    });
    orgIdA = orgA.id;
    trackedOrgIds.add(orgIdA);

    // Create Tenant B (isolation target)
    const orgB = await prisma.organization.create({
      data: { name: `Dashboard Org B ${runId}`, slug: `dash-b-${runId}`, isActive: true },
    });
    orgIdB = orgB.id;
    trackedOrgIds.add(orgIdB);

    // Users in Tenant A
    // 1. Admin
    const adminUserA = await prisma.user.create({
      data: {
        email: `dash-admin-${runId}@orgsphere.test`,
        passwordHash: 'hash',
        firstName: 'Admin',
        lastName: 'A',
        isActive: true,
      },
    });
    trackedUserIds.add(adminUserA.id);
    await prisma.organizationMembership.create({
      data: { userId: adminUserA.id, organizationId: orgIdA, roleId: adminRoleId, isActive: true },
    });
    adminTokenA = generateAccessToken({
      userId: adminUserA.id,
      email: adminUserA.email,
      organizationId: orgIdA,
      roleId: adminRoleId,
      platformRole: 'USER',
    });

    // 2. Manager
    const mgrUserA = await prisma.user.create({
      data: {
        email: `dash-mgr-${runId}@orgsphere.test`,
        passwordHash: 'hash',
        firstName: 'Manager',
        lastName: 'A',
        isActive: true,
      },
    });
    trackedUserIds.add(mgrUserA.id);
    await prisma.organizationMembership.create({
      data: { userId: mgrUserA.id, organizationId: orgIdA, roleId: managerRoleId, isActive: true },
    });

    // 3. Employee
    const empUserA = await prisma.user.create({
      data: {
        email: `dash-emp-${runId}@orgsphere.test`,
        passwordHash: 'hash',
        firstName: 'Employee',
        lastName: 'A',
        isActive: true,
      },
    });
    trackedUserIds.add(empUserA.id);
    await prisma.organizationMembership.create({
      data: { userId: empUserA.id, organizationId: orgIdA, roleId: employeeRoleId, isActive: true },
    });

    // 4. Active Viewer
    const viewerUserA = await prisma.user.create({
      data: {
        email: `dash-viewer-${runId}@orgsphere.test`,
        passwordHash: 'hash',
        firstName: 'Viewer',
        lastName: 'A',
        isActive: true,
      },
    });
    trackedUserIds.add(viewerUserA.id);
    await prisma.organizationMembership.create({
      data: { userId: viewerUserA.id, organizationId: orgIdA, roleId: viewerRoleId, isActive: true },
    });
    viewerTokenA = generateAccessToken({
      userId: viewerUserA.id,
      email: viewerUserA.email,
      organizationId: orgIdA,
      roleId: viewerRoleId,
      platformRole: 'USER',
    });

    // 5. Deactivated Member in Tenant A (must NOT be counted in active dashboard metrics)
    const deactUserA = await prisma.user.create({
      data: {
        email: `dash-deact-${runId}@orgsphere.test`,
        passwordHash: 'hash',
        firstName: 'Deact',
        lastName: 'A',
        isActive: true,
      },
    });
    trackedUserIds.add(deactUserA.id);
    await prisma.organizationMembership.create({
      data: { userId: deactUserA.id, organizationId: orgIdA, roleId: employeeRoleId, isActive: false },
    });

    // Departments in Tenant A: 2 departments
    const dept1 = await prisma.department.create({
      data: { name: `Engineering ${runId}`, organizationId: orgIdA },
    });
    await prisma.department.create({
      data: { name: `Design ${runId}`, organizationId: orgIdA },
    });

    // Projects in Tenant A: 3 projects with different statuses
    const proj1 = await prisma.project.create({
      data: {
        name: `Core Engine ${runId}`,
        status: 'IN_PROGRESS',
        organizationId: orgIdA,
        departmentId: dept1.id,
      },
    });
    await prisma.project.create({
      data: {
        name: `Design System ${runId}`,
        status: 'PLANNING',
        organizationId: orgIdA,
      },
    });
    await prisma.project.create({
      data: {
        name: `Legacy Migration ${runId}`,
        status: 'COMPLETED',
        organizationId: orgIdA,
      },
    });

    // Tasks in Tenant A:
    // Past due date for overdue calculation testing
    const yesterday = new Date(Date.now() - 86400000);
    const tomorrow = new Date(Date.now() + 86400000);

    // Overdue task 1: past due and TODO -> SHOULD count as overdue
    await prisma.task.create({
      data: {
        title: `Overdue Bug ${runId}`,
        status: 'TODO',
        priority: 'URGENT',
        dueDate: yesterday,
        projectId: proj1.id,
        organizationId: orgIdA,
      },
    });

    // Overdue task 2: past due and IN_PROGRESS -> SHOULD count as overdue
    await prisma.task.create({
      data: {
        title: `Late Feature ${runId}`,
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        dueDate: yesterday,
        projectId: proj1.id,
        organizationId: orgIdA,
      },
    });

    // Completed task: past due but DONE -> SHOULD NOT count as overdue
    await prisma.task.create({
      data: {
        title: `Resolved Issue ${runId}`,
        status: 'DONE',
        priority: 'HIGH',
        dueDate: yesterday,
        projectId: proj1.id,
        organizationId: orgIdA,
      },
    });

    // Future task: tomorrow due and TODO -> SHOULD NOT count as overdue
    await prisma.task.create({
      data: {
        title: `Upcoming Milestone ${runId}`,
        status: 'TODO',
        priority: 'LOW',
        dueDate: tomorrow,
        projectId: proj1.id,
        organizationId: orgIdA,
      },
    });

    // Create Audit Log entry for Tenant A (to strictly prove audit logs are NOT exposed on dashboard)
    await prisma.auditLog.create({
      data: {
        action: 'PROJECT_CREATE',
        resourceType: 'Project',
        resourceId: proj1.id,
        actorId: adminUserA.id,
        organizationId: orgIdA,
      },
    });

    // Populate Tenant B with its own department and project to verify isolation
    await prisma.department.create({
      data: { name: `Tenant B Dept ${runId}`, organizationId: orgIdB },
    });
    await prisma.project.create({
      data: { name: `Tenant B Proj ${runId}`, status: 'PLANNING', organizationId: orgIdB },
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it('proves that GET /api/v1/organizations/current/dashboard aggregates metrics accurately and excludes deactivated members', async () => {
    const res = await request(app)
      .get('/api/v1/organizations/current/dashboard')
      .set('Authorization', `Bearer ${adminTokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const metrics = res.body.data;

    // 1. Members metrics: strictly 4 active members (1 Admin, 1 Manager, 1 Employee, 1 Viewer)
    // Deactivated employee must NOT be counted!
    expect(metrics.members).toEqual({
      total: 4,
      byRole: {
        orgAdmin: 1,
        manager: 1,
        employee: 1,
        viewer: 1,
      },
    });

    // 2. Departments: exactly 2
    expect(metrics.departments).toEqual({
      total: 2,
    });

    // 3. Projects: exactly 3 (1 inProgress, 1 planning, 1 completed)
    expect(metrics.projects).toEqual({
      total: 3,
      byStatus: {
        planning: 1,
        inProgress: 1,
        onHold: 0,
        completed: 1,
        cancelled: 0,
      },
    });

    // 4. Tasks: 4 total (2 todo, 1 inProgress, 0 inReview, 1 done; priorities: 1 urgent, 2 high, 1 low, 0 medium)
    // Overdue count: exactly 2 (the 2 past-due non-done tasks; the past-due DONE task is excluded)
    expect(metrics.tasks.total).toBe(4);
    expect(metrics.tasks.byStatus).toEqual({
      todo: 2,
      inProgress: 1,
      inReview: 0,
      done: 1,
    });
    expect(metrics.tasks.byPriority).toEqual({
      low: 1,
      medium: 0,
      high: 2,
      urgent: 1,
    });
    expect(metrics.tasks.overdueCount).toBe(2);
  });

  it('strictly proves zero audit log exposure on the shared dashboard endpoint', async () => {
    const res = await request(app)
      .get('/api/v1/organizations/current/dashboard')
      .set('Authorization', `Bearer ${adminTokenA}`);

    expect(res.status).toBe(200);

    const body = res.body;
    expect(body.data).not.toHaveProperty('recentActivity');
    expect(body.data).not.toHaveProperty('auditLogs');
    expect(body.data).not.toHaveProperty('recentLogs');
    expect(body.data).not.toHaveProperty('activity');
    expect(body.data).not.toHaveProperty('audit');

    // Confirm that the only top-level data keys are members, departments, projects, tasks
    const keys = Object.keys(body.data).sort();
    expect(keys).toEqual(['departments', 'members', 'projects', 'tasks']);
  });

  it('allows access to viewer role with org:read authority', async () => {
    const res = await request(app)
      .get('/api/v1/organizations/current/dashboard')
      .set('Authorization', `Bearer ${viewerTokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.members.total).toBe(4);
  });

  it('proves multi-tenant isolation: Tenant A metrics never include Tenant B entities', async () => {
    const resA = await request(app)
      .get('/api/v1/organizations/current/dashboard')
      .set('Authorization', `Bearer ${adminTokenA}`);

    expect(resA.status).toBe(200);
    // Tenant A has 2 depts, not 3 (Tenant B has 1 dept)
    expect(resA.body.data.departments.total).toBe(2);
    // Tenant A has 3 projects, not 4 (Tenant B has 1 project)
    expect(resA.body.data.projects.total).toBe(3);
  });
});
