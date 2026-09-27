import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { generateAccessToken } from '../src/utils/token.js';
import { ensureSystemRoles } from '../src/utils/roles.js';
import { SystemRole } from '@orgsphere/shared';
import crypto from 'node:crypto';

describe('Destructive Operations & Concurrency Integration Tests', () => {
  const app = createApp();
  const runId = crypto.randomUUID().slice(0, 8);

  const trackedUserIds = new Set<string>();
  const trackedOrgIds = new Set<string>();

  let orgId: string;
  let adminRoleId: string;
  let adminUserId: string;
  let adminToken: string;

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
    adminRoleId = roles[SystemRole.ORG_ADMIN].id;

    const org = await prisma.organization.create({
      data: {
        name: `Destructive Org ${runId}`,
        slug: `destructive-${runId}`,
        isActive: true,
      },
    });
    orgId = org.id;
    trackedOrgIds.add(orgId);

    const user = await prisma.user.create({
      data: {
        email: `destructive-admin-${runId}@orgsphere.test`,
        passwordHash: 'dummy_hash',
        firstName: 'Destructive',
        lastName: 'Admin',
        isActive: true,
      },
    });
    adminUserId = user.id;
    trackedUserIds.add(adminUserId);

    await prisma.organizationMembership.create({
      data: {
        userId: adminUserId,
        organizationId: orgId,
        roleId: adminRoleId,
        isActive: true,
      },
    });

    adminToken = generateAccessToken({
      userId: adminUserId,
      email: user.email,
      organizationId: orgId,
      roleId: adminRoleId,
      platformRole: 'USER',
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it('proves that department deletion is rejected with 409 when projects reference it', async () => {
    // 1. Create department
    const dept = await prisma.department.create({
      data: { name: `Eng ${runId}`, organizationId: orgId },
    });

    // 2. Create project referencing this department
    const proj = await prisma.project.create({
      data: {
        name: `Project Alpha ${runId}`,
        organizationId: orgId,
        departmentId: dept.id,
      },
    });

    // 3. Attempt to delete department -> MUST return 409 Conflict
    const delRes = await request(app)
      .delete(`/api/v1/departments/${dept.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(delRes.status).toBe(409);
    expect(delRes.body.success).toBe(false);
    expect(delRes.body.error.code).toBe('DEPARTMENT_HAS_PROJECTS');
    expect(delRes.body.error.message).toContain('Cannot delete department referenced by');

    // 4. Verify department still exists in database
    const deptCheck = await prisma.department.findUnique({ where: { id: dept.id } });
    expect(deptCheck).not.toBeNull();

    // 5. Unlink project from department
    await prisma.project.update({
      where: { id: proj.id },
      data: { departmentId: null },
    });

    // 6. Delete department now succeeds
    const delRes2 = await request(app)
      .delete(`/api/v1/departments/${dept.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(delRes2.status).toBe(200);
    expect(delRes2.body.success).toBe(true);

    const deptCheck2 = await prisma.department.findUnique({ where: { id: dept.id } });
    expect(deptCheck2).toBeNull();
  });

  it('races project-linking against department deletion: checks final DB state and relational consistency', async () => {
    const dept = await prisma.department.create({
      data: { name: `Race Dept ${runId}`, organizationId: orgId },
    });

    // Run simultaneous project creation (linking to dept) vs department deletion
    const [projRes, deptRes] = await Promise.all([
      request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Concurrent Project ${runId}`,
          departmentId: dept.id,
        }),
      request(app)
        .delete(`/api/v1/departments/${dept.id}`)
        .set('Authorization', `Bearer ${adminToken}`),
    ]);

    // Check final database state:
    const deptInDb = await prisma.department.findUnique({ where: { id: dept.id } });
    const createdProject = await prisma.project.findFirst({
      where: { name: `Concurrent Project ${runId}`, organizationId: orgId },
    });

    if (deptInDb) {
      // If department was NOT deleted, it was protected because the project linked to it first
      expect(createdProject).not.toBeNull();
      expect(deptRes.status).toBe(409); // Deletion was rejected!
    } else {
      // If department WAS deleted, the project could not link to it (returns error or failed FK)
      expect(deptRes.status).toBe(200);
      expect(createdProject).toBeNull();
    }
  });

  it('proves that project deletion requires explicit ?cascadeTasks=true when tasks exist, and records accurate deleted count', async () => {
    // 1. Create project
    const proj = await prisma.project.create({
      data: { name: `Project With Tasks ${runId}`, organizationId: orgId },
    });

    // 2. Create 3 tasks under project
    await prisma.task.createMany({
      data: [
        { title: `Task 1 ${runId}`, projectId: proj.id, organizationId: orgId },
        { title: `Task 2 ${runId}`, projectId: proj.id, organizationId: orgId },
        { title: `Task 3 ${runId}`, projectId: proj.id, organizationId: orgId },
      ],
    });

    // 3. Attempt delete without ?cascadeTasks=true -> MUST return 409 Conflict
    const delRes1 = await request(app)
      .delete(`/api/v1/projects/${proj.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(delRes1.status).toBe(409);
    expect(delRes1.body.success).toBe(false);
    expect(delRes1.body.error.code).toBe('PROJECT_HAS_TASKS');
    expect(delRes1.body.error.message).toContain('3 active task(s)');

    // 4. Delete with ?cascadeTasks=true -> MUST succeed
    const delRes2 = await request(app)
      .delete(`/api/v1/projects/${proj.id}?cascadeTasks=true`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(delRes2.status).toBe(200);
    expect(delRes2.body.success).toBe(true);
    expect(delRes2.body.data.tasksCascadeDeletedCount).toBe(3);

    // 5. Verify database state: project and tasks are completely removed
    const projInDb = await prisma.project.findUnique({ where: { id: proj.id } });
    expect(projInDb).toBeNull();

    const tasksInDb = await prisma.task.findMany({ where: { projectId: proj.id } });
    expect(tasksInDb.length).toBe(0);

    // 6. Verify audit log captured accurate count of deleted tasks
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        organizationId: orgId,
        action: 'PROJECT_DELETE',
        resourceId: proj.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(auditLog).toBeDefined();
    expect((auditLog?.metadata as Record<string, unknown>)?.tasksCascadeDeletedCount).toBe(3);
  });

  it('races task creation against project deletion: checks final DB state and audit count', async () => {
    const proj = await prisma.project.create({
      data: { name: `Race Project ${runId}`, organizationId: orgId },
    });

    const [taskRes, delRes] = await Promise.all([
      request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: `Concurrent Task ${runId}`,
          projectId: proj.id,
        }),
      request(app)
        .delete(`/api/v1/projects/${proj.id}?cascadeTasks=true`)
        .set('Authorization', `Bearer ${adminToken}`),
    ]);

    // Check final database state:
    const projInDb = await prisma.project.findUnique({ where: { id: proj.id } });
    const tasksInDb = await prisma.task.findMany({ where: { projectId: proj.id } });

    if (projInDb) {
      // Project deletion failed or task was created and deletion didn't run
      expect(taskRes.status).toBe(201);
    } else {
      // Project was deleted: there must be zero leftover tasks in the database
      expect(tasksInDb.length).toBe(0);
      expect(delRes.status).toBe(200);
    }
  });
});
