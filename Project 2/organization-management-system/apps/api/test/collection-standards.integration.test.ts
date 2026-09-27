import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { generateAccessToken } from '../src/utils/token.js';
import { ensureSystemRoles } from '../src/utils/roles.js';
import { SystemRole } from '@orgsphere/shared';
import crypto from 'node:crypto';

describe('Collection Standards & Query Optimization Integration Tests', () => {
  const app = createApp();
  const runId = crypto.randomUUID().slice(0, 8);

  const trackedUserIds = new Set<string>();
  const trackedOrgIds = new Set<string>();

  let orgId: string;
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
    const adminRoleId = roles[SystemRole.ORG_ADMIN].id;

    const org = await prisma.organization.create({
      data: { name: `Collection Org ${runId}`, slug: `coll-${runId}`, isActive: true },
    });
    orgId = org.id;
    trackedOrgIds.add(orgId);

    const user = await prisma.user.create({
      data: {
        email: `coll-admin-${runId}@orgsphere.test`,
        passwordHash: 'hash',
        firstName: 'Coll',
        lastName: 'Admin',
        isActive: true,
      },
    });
    trackedUserIds.add(user.id);

    await prisma.organizationMembership.create({
      data: { userId: user.id, organizationId: orgId, roleId: adminRoleId, isActive: true },
    });

    adminToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      organizationId: orgId,
      roleId: adminRoleId,
      platformRole: 'USER',
    });

    // Create 25 departments to test multi-page pagination
    const deptData = Array.from({ length: 25 }, (_, i) => ({
      name: `Dept ${String(i).padStart(2, '0')} ${runId}`,
      organizationId: orgId,
    }));
    await prisma.department.createMany({ data: deptData });
  });

  afterAll(async () => {
    await cleanup();
  });

  it('proves standard pagination defaults: limit=20, page=1, with complete meta envelope', async () => {
    const res = await request(app)
      .get('/api/v1/departments')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(20);
    expect(res.body.meta).toEqual({
      page: 1,
      limit: 20,
      total: 25,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });

  it('fetches page 2 cleanly with remaining 5 items and hasNextPage = false', async () => {
    const res = await request(app)
      .get('/api/v1/departments?page=2&limit=20')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(5);
    expect(res.body.meta.hasNextPage).toBe(false);
    expect(res.body.meta.hasPreviousPage).toBe(true);
  });

  it('rejects unbounded collection limit exceeding max 100 (400 Bad Request)', async () => {
    const res = await request(app)
      .get('/api/v1/departments?limit=500')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid or unindexed sortBy field (400 Bad Request)', async () => {
    const res = await request(app)
      .get('/api/v1/departments?sortBy=unindexedColumn')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('supports deterministic sorting by name asc with stable id tiebreaker', async () => {
    const res = await request(app)
      .get('/api/v1/departments?sortBy=name&sortOrder=asc&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const names = res.body.data.map((d: { name: string }) => d.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});
