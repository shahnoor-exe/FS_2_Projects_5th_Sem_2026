import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { redis } from '../src/config/redis.js';
import { generateAccessToken } from '../src/utils/token.js';
import { ensureSystemRoles } from '../src/utils/roles.js';
import { SystemRole } from '@orgsphere/shared';

describe('Cache Outage Fallback & Error Resilience Integration Tests', () => {
  const app = createApp();
  const runId = crypto.randomUUID().slice(0, 8);

  const trackedUserIds = new Set<string>();
  const trackedOrgIds = new Set<string>();

  let orgId: string;
  let adminToken: string;

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

    const org = await prisma.organization.create({
      data: { name: `Fallback Org ${runId}`, slug: `fallback-${runId}`, isActive: true },
    });
    orgId = org.id;
    trackedOrgIds.add(orgId);

    const admin = await prisma.user.create({
      data: {
        email: `fallback-admin-${runId}@orgsphere.test`,
        passwordHash: 'hash',
        firstName: 'Fallback',
        lastName: 'Admin',
        isActive: true,
      },
    });
    trackedUserIds.add(admin.id);

    await prisma.organizationMembership.create({
      data: { userId: admin.id, organizationId: orgId, roleId: adminRoleId, isActive: true },
    });

    adminToken = generateAccessToken({
      userId: admin.id,
      email: admin.email,
      organizationId: orgId,
      roleId: adminRoleId,
      platformRole: 'USER',
    });

    await prisma.department.create({
      data: { name: `Fallback Dept ${runId}`, organizationId: orgId },
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  it('proves that a Redis cache write failure after DB read returns 200 OK with DB data and X-Cache: BYPASS (never 500)', async () => {
    if (!redis) return;

    // Spy on redis.set to simulate a Redis write error (e.g. read-only replica or OOM)
    const setSpy = vi.spyOn(redis, 'set').mockRejectedValue(
      new Error('READONLY You cannot write against a read only replica')
    );

    try {
      const res = await request(app)
        .get('/api/v1/organizations/current/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      // Must return 200 OK, NOT 500!
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.departments.total).toBe(1);

      // Cache outcome accurately labeled as BYPASS (since caching write failed)
      expect(res.headers['x-cache']).toBe('BYPASS');
    } finally {
      setSpy.mockRestore();
    }
  });

  it('proves that a Redis cache read error falls back cleanly to live database returning 200 OK with X-Cache: BYPASS', async () => {
    if (!redis) return;

    // Spy on redis.get to simulate a Redis read timeout / connection error
    const getSpy = vi.spyOn(redis, 'get').mockRejectedValue(
      new Error('Connection reset by peer')
    );

    try {
      const res = await request(app)
        .get('/api/v1/departments')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.headers['x-cache']).toBe('BYPASS');
    } finally {
      getSpy.mockRestore();
    }
  });

  it('strictly verifies PostgreSQL failure is NOT masked: returns 500 on database error', async () => {
    // Simulate PostgreSQL failure on membership query
    const dbSpy = vi.spyOn(prisma.organizationMembership, 'findMany').mockRejectedValueOnce(
      new Error('FATAL: remaining connection slots are reserved for non-replication superuser connections')
    );

    const res = await request(app)
      .get('/api/v1/organizations/current/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    // Hard PostgreSQL failure must return 500 and NOT be swallowed
    expect(res.status).toBe(500);

    dbSpy.mockRestore();
  });
});
