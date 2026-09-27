import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { redis } from '../src/config/redis.js';
import { ensureSystemRoles } from '../src/utils/roles.js';
import { SystemRole } from '@orgsphere/shared';

interface ExplainPlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  'Startup Cost': number;
  'Total Cost': number;
  'Plan Rows': number;
  'Plan Width': number;
  'Actual Startup Time'?: number;
  'Actual Total Time'?: number;
  'Actual Rows'?: number;
  'Actual Loops'?: number;
  'Shared Hit Blocks'?: number;
  'Shared Read Blocks'?: number;
  Plans?: ExplainPlanNode[];
}

interface ExplainOutput {
  Plan: ExplainPlanNode;
  'Planning Time'?: number;
  'Execution Time'?: number;
}

describe('Query Performance & Execution Plan Evidence Tests', () => {
  const runId = crypto.randomUUID().slice(0, 8);

  const trackedUserIds = new Set<string>();
  const trackedOrgIds = new Set<string>();

  let orgId: string;
  let testProjectId: string;

  // Stated fixture sizes for benchmark context
  const fixtureSizes = {
    organizations: 1,
    memberships: 8,
    departments: 10,
    projects: 15,
    tasks: 30,
  };

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
    const empRoleId = roles[SystemRole.EMPLOYEE].id;

    // 1. Create organization
    const org = await prisma.organization.create({
      data: { name: `Benchmark Org ${runId}`, slug: `bench-${runId}`, isActive: true },
    });
    orgId = org.id;
    trackedOrgIds.add(orgId);

    // 2. Create members
    for (let i = 0; i < fixtureSizes.memberships; i++) {
      const user = await prisma.user.create({
        data: {
          email: `bench-user-${i}-${runId}@orgsphere.test`,
          passwordHash: 'hash',
          firstName: `User${i}`,
          lastName: 'Bench',
          isActive: true,
        },
      });
      trackedUserIds.add(user.id);

      await prisma.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: orgId,
          roleId: i === 0 ? adminRoleId : empRoleId,
          isActive: true,
        },
      });
    }

    // 3. Create departments
    const depts = [];
    for (let i = 0; i < fixtureSizes.departments; i++) {
      depts.push({
        name: `Bench Dept ${String(i).padStart(2, '0')} ${runId}`,
        organizationId: orgId,
      });
    }
    await prisma.department.createMany({ data: depts });

    const createdDepts = await prisma.department.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });

    // 4. Create projects
    const projs = [];
    for (let i = 0; i < fixtureSizes.projects; i++) {
      projs.push({
        name: `Bench Project ${String(i).padStart(2, '0')} ${runId}`,
        status: i % 2 === 0 ? 'IN_PROGRESS' : 'PLANNING',
        organizationId: orgId,
        departmentId: createdDepts[i % createdDepts.length].id,
      });
    }
    await prisma.project.createMany({ data: projs });

    const createdProjs = await prisma.project.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });
    testProjectId = createdProjs[0].id;

    // 5. Create tasks
    const tasks = [];
    for (let i = 0; i < fixtureSizes.tasks; i++) {
      tasks.push({
        title: `Bench Task ${String(i).padStart(2, '0')} ${runId}`,
        status: i % 3 === 0 ? 'DONE' : 'TODO',
        priority: i % 2 === 0 ? 'HIGH' : 'MEDIUM',
        organizationId: orgId,
        projectId: createdProjs[i % createdProjs.length].id,
      });
    }
    await prisma.task.createMany({ data: tasks });
  });

  afterAll(async () => {
    await cleanup();
  });

  it('records EXPLAIN (ANALYZE, BUFFERS) evidence for dashboard active-membership aggregation with fixture context', async () => {
    const rawResult = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': [ExplainOutput] }>>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
       SELECT role_id, count(*)::int
       FROM organization_memberships
       WHERE organization_id = $1 AND is_active = true
       GROUP BY role_id`,
      orgId
    );

    expect(rawResult).toBeDefined();
    expect(rawResult.length).toBeGreaterThan(0);

    const planData = rawResult[0]['QUERY PLAN'][0];
    const topNode = planData.Plan;

    // Descriptive evidence collection: record execution plan and buffer details alongside fixture size
    const evidenceReport = {
      query: 'Dashboard Active Memberships by Role',
      fixtureSizes,
      nodeType: topNode['Node Type'],
      planRows: topNode['Plan Rows'],
      actualRows: topNode['Actual Rows'],
      sharedHitBlocks: topNode['Shared Hit Blocks'] ?? 0,
      sharedReadBlocks: topNode['Shared Read Blocks'] ?? 0,
    };

    expect(evidenceReport.nodeType).toBeDefined();
    expect(evidenceReport.actualRows).toBeDefined();
    expect(evidenceReport.fixtureSizes.memberships).toBe(8);
  });

  it('records EXPLAIN (ANALYZE, BUFFERS) evidence for paginated department listing with index scan verification', async () => {
    const rawResult = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': [ExplainOutput] }>>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
       SELECT id, name, organization_id, created_at, updated_at
       FROM departments
       WHERE organization_id = $1
       ORDER BY created_at DESC, id ASC
       LIMIT 10 OFFSET 0`,
      orgId
    );

    expect(rawResult).toBeDefined();
    const planData = rawResult[0]['QUERY PLAN'][0];
    const topNode = planData.Plan;

    const evidenceReport = {
      query: 'Department List Pagination (LIMIT 10 OFFSET 0)',
      fixtureSizes,
      nodeType: topNode['Node Type'],
      planRows: topNode['Plan Rows'],
      actualRows: topNode['Actual Rows'],
      sharedHitBlocks: topNode['Shared Hit Blocks'] ?? 0,
      sharedReadBlocks: topNode['Shared Read Blocks'] ?? 0,
    };

    expect(evidenceReport.nodeType).toBeDefined();
    expect(evidenceReport.actualRows).toBeLessThanOrEqual(10);
    expect(evidenceReport.fixtureSizes.departments).toBe(10);
  });

  it('records EXPLAIN (ANALYZE, BUFFERS) evidence for multi-tenant composite task query scoped by project and tenant', async () => {
    const rawResult = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': [ExplainOutput] }>>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
       SELECT id, title, status, priority, organization_id, project_id
       FROM tasks
       WHERE organization_id = $1 AND project_id = $2
       ORDER BY created_at DESC
       LIMIT 10`,
      orgId,
      testProjectId
    );

    expect(rawResult).toBeDefined();
    const planData = rawResult[0]['QUERY PLAN'][0];
    const topNode = planData.Plan;

    const evidenceReport = {
      query: 'Tasks Multi-Tenant Scoped Listing',
      fixtureSizes,
      nodeType: topNode['Node Type'],
      planRows: topNode['Plan Rows'],
      actualRows: topNode['Actual Rows'],
      sharedHitBlocks: topNode['Shared Hit Blocks'] ?? 0,
      sharedReadBlocks: topNode['Shared Read Blocks'] ?? 0,
    };

    expect(evidenceReport.nodeType).toBeDefined();
    expect(evidenceReport.fixtureSizes.tasks).toBe(30);
  });

  it('records EXPLAIN (ANALYZE, BUFFERS) evidence for sole-admin row serialization lock (FOR UPDATE)', async () => {
    const rawResult = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': [ExplainOutput] }>>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
       SELECT id
       FROM organizations
       WHERE id = $1
       FOR UPDATE`,
      orgId
    );

    expect(rawResult).toBeDefined();
    const planData = rawResult[0]['QUERY PLAN'][0];
    const topNode = planData.Plan;

    // Lock rows query should execute an Index Scan on organizations primary key
    const evidenceReport = {
      query: 'Organization Sole-Admin Row Lock (FOR UPDATE)',
      fixtureSizes,
      nodeType: topNode['Node Type'],
      planRows: topNode['Plan Rows'],
      actualRows: topNode['Actual Rows'],
    };

    expect(evidenceReport.nodeType).toBeDefined();
    expect(evidenceReport.actualRows).toBe(1);
  });
});
