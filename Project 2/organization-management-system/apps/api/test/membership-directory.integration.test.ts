import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { generateAccessToken } from '../src/utils/token.js';
import { ensureSystemRoles } from '../src/utils/roles.js';
import { SystemRole } from '@orgsphere/shared';
import crypto from 'node:crypto';

describe('Membership Directory & Data Minimization Integration Tests', () => {
  const app = createApp();
  const runId = crypto.randomUUID().slice(0, 8);

  const trackedUserIds = new Set<string>();
  const trackedOrgIds = new Set<string>();

  let orgId: string;
  let adminToken: string;
  let adminRoleId: string;
  let employeeRoleId: string;

  let registeredUserEmail: string;
  let deactivatedUserEmail: string;

  async function cleanup() {
    try {
      if (trackedOrgIds.size > 0) {
        await prisma.auditLog.deleteMany({ where: { organizationId: { in: Array.from(trackedOrgIds) } } });
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
    employeeRoleId = roles[SystemRole.EMPLOYEE].id;

    const org = await prisma.organization.create({
      data: { name: `Dir Org ${runId}`, slug: `dir-${runId}`, isActive: true },
    });
    orgId = org.id;
    trackedOrgIds.add(orgId);

    const admin = await prisma.user.create({
      data: {
        email: `dir-admin-${runId}@orgsphere.test`,
        passwordHash: 'hash',
        firstName: 'Dir',
        lastName: 'Admin',
        phoneCiphertext: 'encrypted_phone_data',
        isActive: true,
      },
    });
    trackedUserIds.add(admin.id);
    await prisma.organizationMembership.create({
      data: { userId: admin.id, organizationId: orgId, roleId: adminRoleId, isActive: true },
    });
    adminToken = generateAccessToken({ userId: admin.id, email: admin.email, organizationId: orgId, roleId: adminRoleId, platformRole: 'USER' });

    // Create an existing registered active user not in this org
    registeredUserEmail = `reg-user-${runId}@orgsphere.test`;
    const regUser = await prisma.user.create({
      data: {
        email: registeredUserEmail,
        passwordHash: 'hash',
        firstName: 'Registered',
        lastName: 'User',
        phoneCiphertext: 'cipher_123',
        isActive: true,
      },
    });
    trackedUserIds.add(regUser.id);

    // Create an existing registered INACTIVE user
    deactivatedUserEmail = `inactive-user-${runId}@orgsphere.test`;
    const deactUser = await prisma.user.create({
      data: {
        email: deactivatedUserEmail,
        passwordHash: 'hash',
        firstName: 'Inactive',
        lastName: 'User',
        isActive: false, // Inactive base user
      },
    });
    trackedUserIds.add(deactUser.id);
  });

  afterAll(async () => {
    await cleanup();
  });

  it('rejects adding an unknown email (404 USER_NOT_FOUND) without creating unverified accounts', async () => {
    const unknownEmail = `unknown-${runId}@orgsphere.test`;
    const res = await request(app)
      .post('/api/v1/memberships')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: unknownEmail, role: SystemRole.EMPLOYEE });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');

    // Confirm no user record was created in the database
    const dbUser = await prisma.user.findUnique({ where: { email: unknownEmail } });
    expect(dbUser).toBeNull();
  });

  it('rejects adding a deactivated user account (ACCOUNT_DEACTIVATED)', async () => {
    const res = await request(app)
      .post('/api/v1/memberships')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: deactivatedUserEmail, role: SystemRole.EMPLOYEE });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('ACCOUNT_DEACTIVATED');
  });

  it('adds an existing registered active user to the organization', async () => {
    const res = await request(app)
      .post('/api/v1/memberships')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: registeredUserEmail, role: SystemRole.EMPLOYEE });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(registeredUserEmail);
    expect(res.body.data.role.name).toBe(SystemRole.EMPLOYEE);
  });

  it('verifies strict data minimization on GET /memberships: strictly omits phone numbers, ciphertexts, and tokens', async () => {
    const res = await request(app)
      .get('/api/v1/memberships')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);

    for (const member of res.body.data) {
      expect(member.id).toBeDefined();
      expect(member.role).toBeDefined();
      expect(member.user).toBeDefined();
      expect(member.user.email).toBeDefined();
      expect(member.user.firstName).toBeDefined();
      expect(member.user.lastName).toBeDefined();

      // STRICT PRIVACY CHECKS:
      expect(member.user.phone).toBeUndefined();
      expect(member.user.phoneCiphertext).toBeUndefined();
      expect(member.user.phoneIv).toBeUndefined();
      expect(member.user.phoneTag).toBeUndefined();
      expect(member.user.passwordHash).toBeUndefined();
      expect(member.refreshToken).toBeUndefined();
    }
  });

  it('proves that member deactivation immediately blocks subsequent requests with 403 MEMBERSHIP_DEACTIVATED', async () => {
    // 1. Get the newly added member
    const mem = await prisma.organizationMembership.findFirstOrThrow({
      where: { organizationId: orgId, user: { email: registeredUserEmail } },
    });

    const memberToken = generateAccessToken({
      userId: mem.userId,
      email: registeredUserEmail,
      organizationId: orgId,
      roleId: employeeRoleId,
      platformRole: 'USER',
    });

    // 2. Member calls GET /memberships while active -> MUST succeed (200 OK)
    const activeRes = await request(app)
      .get('/api/v1/memberships')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(activeRes.status).toBe(200);

    // 3. Admin deactivates the member
    const deactRes = await request(app)
      .patch(`/api/v1/memberships/${mem.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(deactRes.status).toBe(200);

    // 4. Member makes another request -> MUST be immediately rejected with 403 MEMBERSHIP_DEACTIVATED
    const blockedRes = await request(app)
      .get('/api/v1/memberships')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.error.code).toBe('MEMBERSHIP_DEACTIVATED');
  });
});
