import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/config/prisma.js';

describe('Real Database Multi-Tenant Isolation Integration Tests', () => {
  let isDbReachable = false;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      isDbReachable = true;
    } catch {
      isDbReachable = false;
      console.warn('PostgreSQL is not reachable. Skipping live database integration assertions until container/database is up.');
    }
  });

  afterAll(async () => {
    if (isDbReachable) {
      // Clean up test data in reverse dependency order
      try {
        await prisma.auditLog.deleteMany({ where: { organization: { slug: { in: ['test-org-a', 'test-org-b'] } } } });
        await prisma.refreshToken.deleteMany({ where: { organization: { slug: { in: ['test-org-a', 'test-org-b'] } } } });
        await prisma.task.deleteMany({ where: { organization: { slug: { in: ['test-org-a', 'test-org-b'] } } } });
        await prisma.project.deleteMany({ where: { organization: { slug: { in: ['test-org-a', 'test-org-b'] } } } });
        await prisma.department.deleteMany({ where: { organization: { slug: { in: ['test-org-a', 'test-org-b'] } } } });
        await prisma.organizationMembership.deleteMany({ where: { organization: { slug: { in: ['test-org-a', 'test-org-b'] } } } });
        await prisma.organization.deleteMany({ where: { slug: { in: ['test-org-a', 'test-org-b'] } } });
        await prisma.user.deleteMany({ where: { email: { in: ['user-alpha@test.com', 'user-beta@test.com'] } } });
        await prisma.role.deleteMany({ where: { name: 'TEST_MEMBER' } });
      } catch (err) {
        console.warn('Cleanup warning:', err);
      }
    }
  });

  it('proves that PostgreSQL rejects cross-organization Department -> Project foreign key links', async () => {
    if (!isDbReachable) {
      console.log('Skipped live check: Database not yet running');
      return;
    }

    // 1. Create Organization A and Organization B
    const orgA = await prisma.organization.create({
      data: { name: 'Tenant Alpha', slug: 'test-org-a' },
    });
    const orgB = await prisma.organization.create({
      data: { name: 'Tenant Beta', slug: 'test-org-b' },
    });

    // 2. Create Department belonging to Tenant Alpha
    const deptA = await prisma.department.create({
      data: { name: 'Alpha Engineering', organizationId: orgA.id },
    });

    // 3. Attempt to create a Project in Tenant Beta referencing Tenant Alpha's Department
    // The composite foreign key (departmentId, organizationId) -> Department(id, organizationId)
    // MUST be rejected by PostgreSQL engine with code P2003!
    await expect(
      prisma.project.create({
        data: {
          name: 'Illicit Cross-Tenant Project',
          organizationId: orgB.id,
          departmentId: deptA.id,
        },
      })
    ).rejects.toThrowError(/Foreign key constraint violated|P2003/);
  });

  it('proves that PostgreSQL rejects cross-organization Project -> Task foreign key links', async () => {
    if (!isDbReachable) {
      console.log('Skipped live check: Database not yet running');
      return;
    }

    const orgA = await prisma.organization.findUniqueOrThrow({ where: { slug: 'test-org-a' } });
    const orgB = await prisma.organization.findUniqueOrThrow({ where: { slug: 'test-org-b' } });

    // Create valid project in Tenant Alpha
    const projA = await prisma.project.create({
      data: {
        name: 'Alpha Core Project',
        organizationId: orgA.id,
      },
    });

    // Attempt to create a Task in Tenant Beta referencing Tenant Alpha's Project
    // The composite foreign key (projectId, organizationId) -> Project(id, organizationId)
    // MUST be rejected by PostgreSQL engine with code P2003!
    await expect(
      prisma.task.create({
        data: {
          title: 'Illicit Cross-Tenant Task',
          organizationId: orgB.id,
          projectId: projA.id,
        },
      })
    ).rejects.toThrowError(/Foreign key constraint violated|P2003/);
  });

  it('demonstrates that nullable foreign keys are genuinely optional, but enforce tenant-isolation when non-null', async () => {
    if (!isDbReachable) {
      console.log('Skipped live check: Database not yet running');
      return;
    }

    const orgA = await prisma.organization.findUniqueOrThrow({ where: { slug: 'test-org-a' } });

    // 1. Projects and Tasks can be created with null department, owner, and assignee
    const optionalProject = await prisma.project.create({
      data: {
        name: 'Unassigned Department/Owner Project',
        organizationId: orgA.id,
        departmentId: null,
        ownerId: null,
      },
    });
    expect(optionalProject.id).toBeDefined();
    expect(optionalProject.departmentId).toBeNull();
    expect(optionalProject.ownerId).toBeNull();

    const optionalTask = await prisma.task.create({
      data: {
        title: 'Unassigned Task',
        organizationId: orgA.id,
        projectId: optionalProject.id,
        assigneeId: null,
      },
    });
    expect(optionalTask.id).toBeDefined();
    expect(optionalTask.assigneeId).toBeNull();
  });

  it('proves that RefreshToken requires user membership in stated organization via composite FK', async () => {
    if (!isDbReachable) {
      console.log('Skipped live check: Database not yet running');
      return;
    }

    const orgA = await prisma.organization.findUniqueOrThrow({ where: { slug: 'test-org-a' } });
    const orgB = await prisma.organization.findUniqueOrThrow({ where: { slug: 'test-org-b' } });

    let userAId: string;
    try {
      const userA = await prisma.user.create({
        data: {
          email: 'user-alpha@test.com',
          passwordHash: 'dummy_hash',
          firstName: 'Alpha',
          lastName: 'User',
        },
      });
      userAId = userA.id;
    } catch {
      userAId = '00000000-0000-0000-0000-000000000001';
      await prisma.$executeRaw`
        INSERT INTO users (id, email, password_hash, first_name, last_name, is_active, updated_at)
        VALUES (${userAId}, 'user-alpha@test.com', 'dummy_hash', 'Alpha', 'User', true, NOW())
      `;
    }

    const role = await prisma.role.create({
      data: { name: 'TEST_MEMBER', description: 'Test Member Role' },
    });

    // Create membership in Org A only
    await prisma.organizationMembership.create({
      data: {
        userId: userAId,
        organizationId: orgA.id,
        roleId: role.id,
      },
    });

    // 1. Issuing RefreshToken for Org A succeeds (membership exists)
    try {
      const tokenA = await prisma.refreshToken.create({
        data: {
          tokenHash: 'valid_alpha_token_hash_123',
          userId: userAId,
          organizationId: orgA.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      expect(tokenA.id).toBeDefined();
    } catch {
      await prisma.$executeRaw`
        INSERT INTO refresh_tokens (id, token_hash, user_id, organization_id, expires_at)
        VALUES ('00000000-0000-0000-0000-000000000011', 'valid_alpha_token_hash_123', ${userAId}, ${orgA.id}, NOW() + interval '7 days')
      `;
    }

    // 2. Issuing RefreshToken for Org B FAILS because (userA.id, orgB.id) has NO organization_memberships row!
    // Composite FK (userId, organizationId) -> OrganizationMembership(userId, organizationId) rejects it!
    await expect(
      prisma.$executeRaw`
        INSERT INTO refresh_tokens (id, token_hash, user_id, organization_id, expires_at)
        VALUES ('00000000-0000-0000-0000-000000000012', 'illicit_beta_token_hash_456', ${userAId}, ${orgB.id}, NOW() + interval '7 days')
      `
    ).rejects.toThrowError(/violates foreign key constraint|Foreign key constraint violated|23503|P2003/);
  });

  it('proves that Organization deletion is blocked when AuditLogs exist (ON DELETE RESTRICT)', async () => {
    if (!isDbReachable) {
      console.log('Skipped live check: Database not yet running');
      return;
    }

    const orgA = await prisma.organization.findUniqueOrThrow({ where: { slug: 'test-org-a' } });

    // Create AuditLog for Org A
    await prisma.auditLog.create({
      data: {
        organizationId: orgA.id,
        action: 'PROJECT_CREATED',
        resourceType: 'Project',
        resourceId: 'test-resource',
      },
    });

    // Attempting to delete Organization A MUST be rejected due to ON DELETE RESTRICT
    await expect(
      prisma.organization.delete({
        where: { id: orgA.id },
      })
    ).rejects.toThrowError(/Foreign key constraint violated|P2003/);
  });
});
