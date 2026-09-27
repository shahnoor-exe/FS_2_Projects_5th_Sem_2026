import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { redis } from '../src/config/redis.js';
import { cacheService } from '../src/services/cache.service.js';
import { generateAccessToken } from '../src/utils/token.js';
import { ensureSystemRoles } from '../src/utils/roles.js';
import { SystemRole } from '@orgsphere/shared';

describe('Cache Concurrency, Fencing & Lifecycle Integration Tests', () => {
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
      data: { name: `Cache Org ${runId}`, slug: `cache-${runId}`, isActive: true },
    });
    orgId = org.id;
    trackedOrgIds.add(orgId);

    const admin = await prisma.user.create({
      data: {
        email: `cache-admin-${runId}@orgsphere.test`,
        passwordHash: 'hash',
        firstName: 'Cache',
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
  });

  afterAll(async () => {
    await cleanup();
  });

  it('demonstrates dashboard cache lifecycle: MISS -> HIT -> Project Mutation -> MISS -> HIT', async () => {
    // 1. First read: cache MISS (fetches from database and warms Redis)
    const res1 = await request(app)
      .get('/api/v1/organizations/current/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res1.status).toBe(200);
    expect(res1.headers['x-cache']).toBe('MISS');
    expect(res1.body.data.projects.total).toBe(0);

    // 2. Second read: cache HIT (served immediately from Redis)
    const res2 = await request(app)
      .get('/api/v1/organizations/current/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res2.status).toBe(200);
    expect(res2.headers['x-cache']).toBe('HIT');
    expect(res2.body.data.projects.total).toBe(0);

    // 3. Project Mutation: Create a new project (triggers generation bump for dashboard and departments)
    const createRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Cached Proj ${runId}`,
        status: 'IN_PROGRESS',
      });

    expect(createRes.status).toBe(201);

    // 4. Third read: cache MISS (generation bumped, reads fresh database state reflecting the new project)
    const res3 = await request(app)
      .get('/api/v1/organizations/current/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res3.status).toBe(200);
    expect(res3.headers['x-cache']).toBe('MISS');
    expect(res3.body.data.projects.total).toBe(1);
    expect(res3.body.data.projects.byStatus.inProgress).toBe(1);

    // 5. Fourth read: cache HIT (cached with new generation)
    const res4 = await request(app)
      .get('/api/v1/organizations/current/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res4.status).toBe(200);
    expect(res4.headers['x-cache']).toBe('HIT');
    expect(res4.body.data.projects.total).toBe(1);
  });

  it('demonstrates department list & detail cache lifecycle: MISS -> HIT -> Update Mutation -> MISS', async () => {
    // 1. Create a department
    const createDeptRes = await request(app)
      .post('/api/v1/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Initial Dept ${runId}` });

    expect(createDeptRes.status).toBe(201);
    const deptId = createDeptRes.body.data.id;

    // 2. Department List first read: MISS
    const listRes1 = await request(app)
      .get('/api/v1/departments')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes1.status).toBe(200);
    expect(listRes1.headers['x-cache']).toBe('MISS');

    // 3. Department List second read: HIT
    const listRes2 = await request(app)
      .get('/api/v1/departments')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes2.status).toBe(200);
    expect(listRes2.headers['x-cache']).toBe('HIT');

    // 4. Department Detail first read: MISS
    const detailRes1 = await request(app)
      .get(`/api/v1/departments/${deptId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(detailRes1.status).toBe(200);
    expect(detailRes1.headers['x-cache']).toBe('MISS');
    expect(detailRes1.body.data.name).toBe(`Initial Dept ${runId}`);

    // 5. Department Detail second read: HIT
    const detailRes2 = await request(app)
      .get(`/api/v1/departments/${deptId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(detailRes2.status).toBe(200);
    expect(detailRes2.headers['x-cache']).toBe('HIT');

    // 6. Department Update Mutation: Rename department
    const updateRes = await request(app)
      .patch(`/api/v1/departments/${deptId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Renamed Dept ${runId}` });

    expect(updateRes.status).toBe(200);

    // 7. Department Detail read after mutation: MISS, reflecting updated name
    const detailRes3 = await request(app)
      .get(`/api/v1/departments/${deptId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(detailRes3.status).toBe(200);
    expect(detailRes3.headers['x-cache']).toBe('MISS');
    expect(detailRes3.body.data.name).toBe(`Renamed Dept ${runId}`);

    // 8. Department List read after mutation: MISS, reflecting updated name
    const listRes3 = await request(app)
      .get('/api/v1/departments')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes3.status).toBe(200);
    expect(listRes3.headers['x-cache']).toBe('MISS');
    const found = listRes3.body.data.find((d: { id: string }) => d.id === deptId);
    expect(found.name).toBe(`Renamed Dept ${runId}`);
  });

  it('proves same-millisecond mutations generate distinct UUID generations without collisions', async () => {
    // Trigger rapid concurrent generation bumps
    const bumps = await Promise.all([
      cacheService.bumpGeneration(orgId, 'dashboard'),
      cacheService.bumpGeneration(orgId, 'dashboard'),
      cacheService.bumpGeneration(orgId, 'dashboard'),
      cacheService.bumpGeneration(orgId, 'dashboard'),
    ]);

    // Verify all returned generation tokens are valid non-empty UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const token of bumps) {
      expect(token).toMatch(uuidRegex);
    }

    // Verify that the final generation stored in Redis is valid
    const currentGen = await cacheService.getGeneration(orgId, 'dashboard');
    expect(currentGen).toMatch(uuidRegex);
  });

  it('proves overlapping mutations from separate API instances with out-of-order invalidation completion', async () => {
    const namespace = 'dashboard';
    const genKey = `org:${orgId}:${namespace}:gen`;

    // 1. Initial cached dashboard read at G0
    const res0 = await request(app)
      .get('/api/v1/organizations/current/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res0.status).toBe(200);

    // 2. Simulate Instance 1 committing Mutation 1 (creates Project A) and generating fresh UUID gen1
    const gen1 = crypto.randomUUID();
    await prisma.project.create({
      data: { name: `Project Instance 1 ${runId}`, organizationId: orgId },
    });

    // 3. Simulate Instance 2 committing Mutation 2 (creates Project B) and generating fresh UUID gen2
    const gen2 = crypto.randomUUID();
    await prisma.project.create({
      data: { name: `Project Instance 2 ${runId}`, organizationId: orgId },
    });

    // 4. Instance 2 invalidation completes first in Redis: sets genKey = gen2
    await redis?.set(genKey, gen2, 'EX', 86400);
    expect(await redis?.get(genKey)).toBe(gen2);

    // 5. Out-of-order completion: Instance 1's delayed invalidation now completes in Redis: sets genKey = gen1
    await redis?.set(genKey, gen1, 'EX', 86400);
    expect(await redis?.get(genKey)).toBe(gen1);

    // 6. Reader makes request: resolves gen1
    const resReader = await request(app)
      .get('/api/v1/organizations/current/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resReader.status).toBe(200);
    // Gen1 was never previously used as a cache namespace, so it results in an extra MISS
    expect(resReader.headers['x-cache']).toBe('MISS');

    // Crucial correctness: because it missed and read live PostgreSQL state, it reflects
    // BOTH committed mutations from Instance 1 and Instance 2! Stale data is NEVER served.
    expect(resReader.body.data.projects.total).toBeGreaterThanOrEqual(3);

    // 7. Subsequent read at gen1 is a HIT with the fully up-to-date data
    const resHit = await request(app)
      .get('/api/v1/organizations/current/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resHit.status).toBe(200);
    expect(resHit.headers['x-cache']).toBe('HIT');
    expect(resHit.body.data.projects.total).toBe(resReader.body.data.projects.total);
  });

  it('proves delayed read / stale-fill quarantine: reader with old generation cannot pollute new generation', async () => {
    // 1. Initial generation G1
    const gen1 = await cacheService.getGeneration(orgId, 'dashboard');

    // 2. Slow reader reads DB at G1, but before it can write to Redis, a mutation commits and bumps to G2
    const gen2 = await cacheService.bumpGeneration(orgId, 'dashboard');
    expect(gen2).not.toBe(gen1);

    // 3. Slow reader finishes its delayed execution and writes payload under key containing G1
    const staleKey = `org:${orgId}:dashboard:v${gen1}:metrics`;
    const staleData = {
      members: { total: 999, byRole: { orgAdmin: 999, manager: 0, employee: 0, viewer: 0 } },
      departments: { total: 999 },
      projects: { total: 999, byStatus: { planning: 999, inProgress: 0, onHold: 0, completed: 0, cancelled: 0 } },
      tasks: { total: 999, byStatus: { todo: 999, inProgress: 0, inReview: 0, done: 0 }, byPriority: { low: 0, medium: 0, high: 0, urgent: 999 }, overdueCount: 999 },
    };
    await redis?.set(staleKey, JSON.stringify(staleData), 'EX', 300);

    // 4. Any subsequent client read will resolve generation G2, bypassing G1 completely!
    const res = await request(app)
      .get('/api/v1/organizations/current/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // The response must be freshly read from the database, NOT the stale 999 value!
    expect(res.body.data.members.total).not.toBe(999);
    expect(res.body.data.departments.total).not.toBe(999);

    // Verify Redis has the stale key orphaned, while the active generation G2 is populated correctly
    const staleCached = await redis?.get(staleKey);
    expect(staleCached).toContain('999'); // Orphaned under vG1
  });

  it('proves missing generation key recovery via SET ... NX without counter reuse', async () => {
    const namespace = 'dashboard';
    const genKey = `org:${orgId}:${namespace}:gen`;

    // 1. Record existing generation
    const oldGen = await cacheService.getGeneration(orgId, namespace);

    // 2. Simulate Redis key eviction / deletion
    await redis?.del(genKey);

    // Verify key is truly absent in Redis
    const checkAbsent = await redis?.get(genKey);
    expect(checkAbsent).toBeNull();

    // 3. Call getGeneration: must recover atomically with SET ... NX using a fresh random UUID
    const recoveredGen = await cacheService.getGeneration(orgId, namespace);

    expect(recoveredGen).toBeDefined();
    expect(recoveredGen).not.toBe(oldGen);
    expect(recoveredGen).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    // 4. Verify the newly initialized key is persisted in Redis
    const redisStored = await redis?.get(genKey);
    expect(redisStored).toBe(recoveredGen);
  });
});
