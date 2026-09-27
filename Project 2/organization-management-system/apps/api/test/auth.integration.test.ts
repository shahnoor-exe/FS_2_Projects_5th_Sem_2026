import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { getCookieName } from '../src/modules/auth/auth.controller.js';
import { resetRateLimits } from '../src/middlewares/rateLimiter.js';
import { authenticate } from '../src/middlewares/authenticate.js';
import { requirePlatformAdmin } from '../src/middlewares/requirePlatformAdmin.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import { generateAccessToken, hashRefreshToken } from '../src/utils/token.js';
import { PlatformRole } from '@orgsphere/shared';
import crypto from 'node:crypto';

describe('Phase 2 Auth & Access Control Integration Tests', () => {
  const app = createApp();

  // Unique run identifier ensures zero collisions and surgical per-run cleanup
  const runId = crypto.randomUUID().slice(0, 8);
  const aliceEmail = `alice-${runId}@orgsphere.test`;
  const bobEmail = `bob-${runId}@orgsphere.test`;
  const unknownEmail = `unknown-${runId}@orgsphere.test`;
  const orgName = `Alice Corp ${runId}`;

  // Track exact identifiers created in this run
  const trackedUserIds = new Set<string>();
  const trackedOrgIds = new Set<string>();
  const trackedAuditLogIds = new Set<string>();

  async function cleanup() {
    resetRateLimits();
    try {
      // 1. Delete audit logs matching exact tracked IDs or exact test emails
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { id: { in: Array.from(trackedAuditLogIds) } },
            { actor: { email: { in: [aliceEmail, bobEmail] } } },
            { metadata: { path: ['emailAttempted'], equals: unknownEmail } },
            { metadata: { path: ['email'], equals: aliceEmail } },
          ],
        },
      });

      // 2. Delete refresh tokens for exact tracked users
      await prisma.refreshToken.deleteMany({
        where: {
          OR: [
            { userId: { in: Array.from(trackedUserIds) } },
            { user: { email: { in: [aliceEmail, bobEmail] } } },
          ],
        },
      });

      // 3. Delete memberships for exact tracked users
      await prisma.organizationMembership.deleteMany({
        where: {
          OR: [
            { userId: { in: Array.from(trackedUserIds) } },
            { user: { email: { in: [aliceEmail, bobEmail] } } },
          ],
        },
      });

      // 4. Delete projects/departments/organizations for exact tracked orgs
      if (trackedOrgIds.size > 0) {
        await prisma.project.deleteMany({ where: { organizationId: { in: Array.from(trackedOrgIds) } } });
        await prisma.department.deleteMany({ where: { organizationId: { in: Array.from(trackedOrgIds) } } });
        await prisma.organization.deleteMany({ where: { id: { in: Array.from(trackedOrgIds) } } });
      }

      // 5. Delete exact tracked users
      await prisma.user.deleteMany({
        where: {
          OR: [
            { id: { in: Array.from(trackedUserIds) } },
            { email: { in: [aliceEmail, bobEmail] } },
          ],
        },
      });
    } catch (err) {
      console.warn('Cleanup warning:', err);
    }
  }

  beforeAll(async () => {
    // Verify database connection and Phase 2 schema migration
    const res = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'platform_role'
      );
    `;
    expect(res[0]?.exists).toBe(true);

    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it('proves that registration creates user, tenant, ORG_ADMIN membership, encrypted phone, and ignores platformRole injection', async () => {
    // 1. Attempt injection of platformRole -> MUST fail validation
    const maliciousRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `malicious-${runId}@orgsphere.test`,
        password: 'valid-secure-passphrase-1234',
        firstName: 'Malicious',
        lastName: 'User',
        organizationName: `Malicious Tenant ${runId}`,
        platformRole: 'SUPER_ADMIN',
      });
    expect(maliciousRes.status).toBe(400);

    // 2. Legitimate registration
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: aliceEmail,
        password: 'alice-secure-passphrase-2026!',
        firstName: 'Alice',
        lastName: 'Smith',
        organizationName: orgName,
        phone: '+15551234567',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(aliceEmail);
    expect(res.body.data.user.platformRole).toBe('USER'); // Enforced 'USER'
    expect(res.body.data.accessToken).toBeDefined();

    trackedUserIds.add(res.body.data.user.id);
    trackedOrgIds.add(res.body.data.organization.id);

    // Verify cookie parameters
    const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
    expect(cookies).toBeDefined();
    const cookieHeader = cookies?.find((c: string) => c.includes(getCookieName()));
    expect(cookieHeader).toBeDefined();
    expect(cookieHeader).toContain('Path=/api/v1/auth');
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader?.toLowerCase()).toContain('samesite=strict');

    // Verify raw DB row has phone ciphertext and IV
    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: res.body.data.user.id } });
    expect(dbUser.phoneCiphertext).toBeDefined();
    expect(dbUser.phoneIv).toBeDefined();
    expect(dbUser.phoneTag).toBeDefined();
    expect(dbUser.phoneCiphertext).not.toBe('+15551234567');
  });

  it('proves that login succeeds with valid credentials and sets refresh cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: aliceEmail,
        password: 'alice-secure-passphrase-2026!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('proves that failed login records audit log with organizationId = null', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: unknownEmail,
        password: 'some-random-password-1234',
      });

    expect(res.status).toBe(401);

    // Verify audit log has organizationId = null and retain its exact ID for cleanup
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'AUTH_LOGIN_FAILED',
        metadata: { path: ['emailAttempted'], equals: unknownEmail },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeDefined();
    expect(audit?.organizationId).toBeNull();
    if (audit) trackedAuditLogIds.add(audit.id);
  });

  it('proves concurrent refresh race: winner token remains usable and duplicate does NOT revoke family', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: aliceEmail,
        password: 'alice-secure-passphrase-2026!',
      });

    const cookie = loginRes.headers['set-cookie'];

    // Send two concurrent refresh requests simultaneously with valid Origin and client headers
    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:3000')
        .set('x-orgsphere-client', 'web'),
      request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:3000')
        .set('x-orgsphere-client', 'web'),
    ]);

    // Exactly one must be 200 and the competing duplicate must be 409 CONCURRENT_REFRESH_RACE
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const winnerRes = resA.status === 200 ? resA : resB;
    const loserRes = resA.status === 409 ? resA : resB;

    expect(loserRes.body.error.code).toBe('CONCURRENT_REFRESH_RACE');

    // CRUCIAL: Verify that the winner's new access token is completely usable on protected routes!
    const testProtected = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${winnerRes.body.data.accessToken}`);

    expect(testProtected.status).toBe(200);
    expect(testProtected.body.data.user.email).toBe(aliceEmail);

    // CRUCIAL: Verify that the winner's replacement refresh cookie is also usable to rotate again!
    const nextRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', winnerRes.headers['set-cookie'])
      .set('Origin', 'http://localhost:3000')
      .set('x-orgsphere-client', 'web');

    expect(nextRefresh.status).toBe(200);
    expect(nextRefresh.body.data.accessToken).toBeDefined();
  });

  it('proves 3-tier immediate deactivation against PostgreSQL: distinct 401 for user, 403 for org, 403 for membership', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: aliceEmail,
        password: 'alice-secure-passphrase-2026!',
      });

    expect(loginRes.status).toBe(200);
    const accessToken = loginRes.body.data.accessToken;
    const userId = loginRes.body.data.user.id;
    const orgId = loginRes.body.data.organization.id;

    // 1. Tier 1: Inactive Membership -> 403 MEMBERSHIP_DEACTIVATED
    try {
      await prisma.organizationMembership.updateMany({
        where: { userId },
        data: { isActive: false },
      });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('MEMBERSHIP_DEACTIVATED');
    } finally {
      await prisma.organizationMembership.updateMany({
        where: { userId },
        data: { isActive: true },
      });
    }

    // 2. Tier 2: Inactive Organization -> 403 ORGANIZATION_DEACTIVATED
    try {
      await prisma.organization.update({
        where: { id: orgId },
        data: { isActive: false },
      });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ORGANIZATION_DEACTIVATED');
    } finally {
      await prisma.organization.update({
        where: { id: orgId },
        data: { isActive: true },
      });
    }

    // 3. Tier 3: Inactive User -> 401 ACCOUNT_DEACTIVATED
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { isActive: false },
      });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('ACCOUNT_DEACTIVATED');
    } finally {
      await prisma.user.update({
        where: { id: userId },
        data: { isActive: true },
      });
    }
  });

  it('proves strict tenant binding: x-org-id mismatch is rejected with 403 TENANT_MISMATCH', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: aliceEmail,
        password: 'alice-secure-passphrase-2026!',
      });

    const accessToken = loginRes.body.data.accessToken;

    // Send valid token with mismatching x-org-id header
    const mismatchRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-org-id', '00000000-0000-0000-0000-000000000000');

    expect(mismatchRes.status).toBe(403);
    expect(mismatchRes.body.error.code).toBe('TENANT_MISMATCH');
  });

  it('proves CSRF protection: validates Origin, Referer, and client header for cookie-bearing refresh', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: aliceEmail,
        password: 'alice-secure-passphrase-2026!',
      });

    const cookie = loginRes.headers['set-cookie'];

    // 1. Rejects when missing CSRF verification header
    const noHeaderRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie);

    expect(noHeaderRes.status).toBe(401);
    expect(noHeaderRes.body.error.message).toContain('Missing CSRF verification header');

    // 2. Rejects when Origin header does not match env.CORS_ORIGIN
    const badOriginRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .set('Origin', 'http://malicious-attacker.evil')
      .set('x-orgsphere-client', 'web');

    expect(badOriginRes.status).toBe(401);
    expect(badOriginRes.body.error.message).toContain('untrusted origin');

    // 3. Rejects when Referer header origin does not match env.CORS_ORIGIN
    const badRefererRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .set('Referer', 'http://malicious-attacker.evil/phishing-page')
      .set('x-orgsphere-client', 'web');

    expect(badRefererRes.status).toBe(401);
    expect(badRefererRes.body.error.message).toContain('untrusted referer origin');

    // 4. Accepts when Origin matches trusted env.CORS_ORIGIN (http://localhost:3000)
    const goodOriginRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .set('x-orgsphere-client', 'web');

    expect(goodOriginRes.status).toBe(200);
    expect(goodOriginRes.body.data.accessToken).toBeDefined();
  });

  it('proves platform administrator controls: requirePlatformAdmin enforces live SUPER_ADMIN platform role and immediate demotion', async () => {
    const adminApp = express();
    adminApp.use(express.json());
    adminApp.get('/test-platform-admin', authenticate, requirePlatformAdmin, (_req, res) => {
      res.json({ success: true, message: 'platform admin access granted' });
    });
    adminApp.use(errorHandler);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: aliceEmail,
        password: 'alice-secure-passphrase-2026!',
      });

    const userToken = loginRes.body.data.accessToken;
    const userId = loginRes.body.data.user.id;
    const orgId = loginRes.body.data.organization.id;

    // 1. Regular user (platformRole = USER in DB) MUST be rejected with 403 FORBIDDEN
    const forbiddenRes = await request(adminApp)
      .get('/test-platform-admin')
      .set('Authorization', `Bearer ${userToken}`);

    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.error.code).toBe('FORBIDDEN');

    // 2. Promote user in database to SUPER_ADMIN
    await prisma.user.update({
      where: { id: userId },
      data: { platformRole: PlatformRole.SUPER_ADMIN },
    });

    const superAdminToken = generateAccessToken({
      userId,
      email: aliceEmail,
      organizationId: orgId,
      roleId: 'mock-role-id',
      platformRole: PlatformRole.SUPER_ADMIN,
    });

    // 3. Active SUPER_ADMIN token succeeds with 200 OK
    const adminRes = await request(adminApp)
      .get('/test-platform-admin')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.success).toBe(true);

    // 4. CRITICAL: Demote user in PostgreSQL directly back to USER
    await prisma.user.update({
      where: { id: userId },
      data: { platformRole: PlatformRole.USER },
    });

    // 5. Retry with the SAME previously issued superAdminToken
    // requirePlatformAdmin queries PostgreSQL directly, detecting demotion immediately!
    const demotedRetryRes = await request(adminApp)
      .get('/test-platform-admin')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(demotedRetryRes.status).toBe(403);
    expect(demotedRetryRes.body.error.code).toBe('FORBIDDEN');
  });

  it('proves token replay attack outside duplicate window triggers entire family revocation and audit logging', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: aliceEmail,
        password: 'alice-secure-passphrase-2026!',
      });

    const orgId = loginRes.body.data.organization.id;
    const userId = loginRes.body.data.user.id;

    const familyId = crypto.randomUUID();
    const cleartextStolenToken = `stolen-refresh-token-${Date.now()}`;
    const stolenHash = hashRefreshToken(cleartextStolenToken);

    // Simulate a token that was rotated 10 seconds ago (outside the 5-second duplicate race window)
    const oldRevokedAt = new Date(Date.now() - 10000);

    await prisma.refreshToken.create({
      data: {
        tokenHash: stolenHash,
        userId,
        organizationId: orgId,
        familyId,
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: oldRevokedAt,
        revocationReason: 'ROTATED',
      },
    });

    // Also create an active successor token in the same family
    const cleartextSuccessorToken = `active-successor-token-${Date.now()}`;
    const successorHash = hashRefreshToken(cleartextSuccessorToken);

    const activeSuccessor = await prisma.refreshToken.create({
      data: {
        tokenHash: successorHash,
        userId,
        organizationId: orgId,
        familyId,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    // Attacker attempts to replay the old stolen token (sent via request body, bypassing cookie CSRF)
    const replayRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: cleartextStolenToken });

    expect(replayRes.status).toBe(401);
    expect(replayRes.body.error.message).toContain('replay detection');

    // Verify entire family (including the active successor) is now revoked with SECURITY_REUSE
    const updatedSuccessor = await prisma.refreshToken.findUniqueOrThrow({
      where: { id: activeSuccessor.id },
    });
    expect(updatedSuccessor.revokedAt).not.toBeNull();
    expect(updatedSuccessor.revocationReason).toBe('SECURITY_REUSE');

    // Verify audit log recorded AUTH_TOKEN_REUSE_DETECTED
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'AUTH_TOKEN_REUSE_DETECTED',
        organizationId: orgId,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeDefined();
    expect(audit?.actorId).toBe(userId);
  });

  it('proves logout clears cookie and revoking specific token does not trigger family theft revocation', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: aliceEmail,
        password: 'alice-secure-passphrase-2026!',
      });

    const cookie = loginRes.headers['set-cookie'];

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .set('x-orgsphere-client', 'web');

    expect(logoutRes.status).toBe(200);

    // Verify clear cookie header
    const clearCookies = logoutRes.headers['set-cookie'] as unknown as string[] | undefined;
    expect(clearCookies).toBeDefined();
    const cleared = clearCookies?.find((c: string) => c.includes(getCookieName()));
    expect(cleared).toContain('Path=/api/v1/auth');
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
  });

  // ─── Switch-Org Session Management & Race Tests ─────────────────────────────
  let orgBId: string;
  let orgBName: string;

  async function getOrgB(): Promise<{ id: string; name: string }> {
    if (orgBId) return { id: orgBId, name: orgBName };
    const alice = await prisma.user.findUniqueOrThrow({ where: { email: aliceEmail } });
    orgBName = `Acme Beta ${runId}`;
    const orgB = await prisma.organization.create({
      data: {
        name: orgBName,
        slug: `acme-beta-${runId}`,
        isActive: true,
      },
    });
    trackedOrgIds.add(orgB.id);

    const viewerRole = await prisma.role.findFirstOrThrow({ where: { name: 'VIEWER' } });
    await prisma.organizationMembership.create({
      data: {
        userId: alice.id,
        organizationId: orgB.id,
        roleId: viewerRole.id,
        isActive: true,
      },
    });
    orgBId = orgB.id;
    return { id: orgBId, name: orgBName };
  }

  it('proves switch-org rotates refresh cookie, binds to target tenant, and subsequent refresh + /auth/me retains switched organization', async () => {
    const orgB = await getOrgB();

    // 1. Alice logs in to primary organization
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: aliceEmail,
        password: 'alice-secure-passphrase-2026!',
      });
    expect(loginRes.status).toBe(200);
    const primaryToken = loginRes.body.data.accessToken;
    const cookieA = loginRes.headers['set-cookie'];
    expect(cookieA).toBeDefined();

    // 2. Switch to Org B
    const switchRes = await request(app)
      .post('/api/v1/auth/switch-org')
      .set('Authorization', `Bearer ${primaryToken}`)
      .set('Cookie', cookieA)
      .set('Origin', 'http://localhost:3000')
      .set('x-orgsphere-client', 'web')
      .send({ targetOrganizationId: orgB.id });

    expect(switchRes.status).toBe(200);
    expect(switchRes.body.success).toBe(true);
    expect(switchRes.body.data.organization.id).toBe(orgB.id);
    expect(switchRes.body.data.accessToken).toBeDefined();
    // Critical: Plaintext refresh token must NEVER be returned in JSON response
    expect((switchRes.body.data as Record<string, unknown>).refreshToken).toBeUndefined();

    // Verify newly issued cookie is present and scoped to /api/v1/auth
    const cookieB = switchRes.headers['set-cookie'];
    expect(cookieB).toBeDefined();
    const cookieHeader = Array.isArray(cookieB) ? cookieB.join(';') : (cookieB as string);
    expect(cookieHeader).toContain(getCookieName());
    expect(cookieHeader).toContain('Path=/api/v1/auth');
    expect(cookieHeader).toContain('HttpOnly');

    // 3. Call /auth/refresh with the new cookie
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieB)
      .set('Origin', 'http://localhost:3000')
      .set('x-orgsphere-client', 'web');

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    const refreshedToken = refreshRes.body.data.accessToken;
    expect(refreshedToken).toBeDefined();

    // 4. Call /auth/me with refreshed token -> verifies session remains Org B
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshedToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.currentOrganization.id).toBe(orgB.id);
    expect(meRes.body.data.currentOrganization.name).toBe(orgB.name);
    expect(meRes.body.data.currentOrganization.role).toBe('VIEWER');
  });

  it('proves browser reload after switch-org restores session bound to the target organization', async () => {
    const orgB = await getOrgB();

    // 1. Alice logs in to primary org
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: aliceEmail,
        password: 'alice-secure-passphrase-2026!',
      });
    const primaryToken = loginRes.body.data.accessToken;
    const cookieA = loginRes.headers['set-cookie'];

    // 2. Alice switches to Org B
    const switchRes = await request(app)
      .post('/api/v1/auth/switch-org')
      .set('Authorization', `Bearer ${primaryToken}`)
      .set('Cookie', cookieA)
      .set('Origin', 'http://localhost:3000')
      .set('x-orgsphere-client', 'web')
      .send({ targetOrganizationId: orgB.id });

    expect(switchRes.status).toBe(200);
    const cookieB = switchRes.headers['set-cookie'];

    // 3. Simulate browser reload: in-memory access token is lost.
    // Browser startup initiates silent refresh using the persisted cookieB.
    const reloadRefreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieB)
      .set('Origin', 'http://localhost:3000')
      .set('x-orgsphere-client', 'web');

    expect(reloadRefreshRes.status).toBe(200);
    const restoredAccessToken = reloadRefreshRes.body.data.accessToken;
    expect(restoredAccessToken).toBeDefined();

    // 4. Initial me query verifies the session is established for Org B, not Org A
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${restoredAccessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.currentOrganization.id).toBe(orgB.id);
    expect(meRes.body.data.currentOrganization.name).toBe(orgB.name);
  });

  it('proves old pre-switch refresh cookie is revoked with ORG_SWITCH and rejected upon reuse', async () => {
    const orgB = await getOrgB();

    // 1. Alice logs in to primary org
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: aliceEmail,
        password: 'alice-secure-passphrase-2026!',
      });
    const primaryToken = loginRes.body.data.accessToken;
    const cookieA = loginRes.headers['set-cookie'];

    // 2. Switch to Org B rotates cookieA
    const switchRes = await request(app)
      .post('/api/v1/auth/switch-org')
      .set('Authorization', `Bearer ${primaryToken}`)
      .set('Cookie', cookieA)
      .set('Origin', 'http://localhost:3000')
      .set('x-orgsphere-client', 'web')
      .send({ targetOrganizationId: orgB.id });
    expect(switchRes.status).toBe(200);

    // 3. Attempting to use old cookieA on /auth/refresh MUST be rejected
    const staleRefreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieA)
      .set('Origin', 'http://localhost:3000')
      .set('x-orgsphere-client', 'web');

    // Inside duplicate race window returns 409 CONCURRENT_REFRESH_RACE; outside returns 401
    expect([401, 409]).toContain(staleRefreshRes.status);

    // 4. Attempting to use old cookieA on /auth/switch-org MUST also be rejected
    const staleSwitchRes = await request(app)
      .post('/api/v1/auth/switch-org')
      .set('Authorization', `Bearer ${primaryToken}`)
      .set('Cookie', cookieA)
      .set('Origin', 'http://localhost:3000')
      .set('x-orgsphere-client', 'web')
      .send({ targetOrganizationId: orgB.id });

    expect([401, 409]).toContain(staleSwitchRes.status);
  });

  it('proves switch-org rejects requests with missing cookie, invalid CSRF, or mismatched session', async () => {
    const orgB = await getOrgB();

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: aliceEmail,
        password: 'alice-secure-passphrase-2026!',
      });
    const primaryToken = loginRes.body.data.accessToken;
    const cookieA = loginRes.headers['set-cookie'];

    // 1. Missing cookie rejection: Bearer token provided with valid client headers, but no cookie
    const missingCookieRes = await request(app)
      .post('/api/v1/auth/switch-org')
      .set('Authorization', `Bearer ${primaryToken}`)
      .set('Origin', 'http://localhost:3000')
      .set('x-orgsphere-client', 'web')
      .send({ targetOrganizationId: orgB.id });

    expect(missingCookieRes.status).toBe(401);
    expect(missingCookieRes.body.error.code).toBe('UNAUTHENTICATED');
    expect(missingCookieRes.body.error.message).toContain('Refresh cookie required');

    // 2. Unconditional CSRF rejection: Missing trusted client header (with or without cookie)
    const missingCsrfRes = await request(app)
      .post('/api/v1/auth/switch-org')
      .set('Authorization', `Bearer ${primaryToken}`)
      .set('Cookie', cookieA)
      .set('Origin', 'http://localhost:3000')
      .send({ targetOrganizationId: orgB.id });

    expect(missingCsrfRes.status).toBe(401);
    expect(missingCsrfRes.body.error.message).toContain('CSRF');

    // 3. Untrusted origin rejection
    const badOriginRes = await request(app)
      .post('/api/v1/auth/switch-org')
      .set('Authorization', `Bearer ${primaryToken}`)
      .set('Cookie', cookieA)
      .set('Origin', 'https://attacker.evil.com')
      .set('x-orgsphere-client', 'web')
      .send({ targetOrganizationId: orgB.id });

    expect(badOriginRes.status).toBe(401);
    expect(badOriginRes.body.error.message).toContain('CSRF check failed: untrusted origin');

    // 4. Session mismatch: Presenting another user's / another org's refresh token
    const bobLoginRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: bobEmail,
        password: 'bob-secure-passphrase-2026!',
        firstName: 'Bob',
        lastName: 'Jones',
        organizationName: `Bob Org ${runId}`,
      });
    trackedUserIds.add(bobLoginRes.body.data.user.id);
    trackedOrgIds.add(bobLoginRes.body.data.organization.id);
    const bobCookie = bobLoginRes.headers['set-cookie'];

    const mismatchRes = await request(app)
      .post('/api/v1/auth/switch-org')
      .set('Authorization', `Bearer ${primaryToken}`)
      .set('Cookie', bobCookie)
      .set('Origin', 'http://localhost:3000')
      .set('x-orgsphere-client', 'web')
      .send({ targetOrganizationId: orgB.id });

    expect(mismatchRes.status).toBe(401);
    expect(mismatchRes.body.error.code).toBe('UNAUTHENTICATED');
    expect(mismatchRes.body.error.message).toContain('Refresh token does not match active authenticated session');
  });

  it('proves that a request with a valid bearer token and refresh token supplied only in JSON body is rejected without setting cookie or creating replacement token', async () => {
    const orgB = await getOrgB();

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: aliceEmail,
        password: 'alice-secure-passphrase-2026!',
      });
    const primaryToken = loginRes.body.data.accessToken;
    const cookieA = loginRes.headers['set-cookie'];
    const cookieStr = Array.isArray(cookieA) ? cookieA.join(';') : (cookieA as string);
    const match = cookieStr.match(new RegExp(`${getCookieName()}=([^;]+)`));
    const rawRefreshToken = match ? decodeURIComponent(match[1]) : 'dummy-refresh-token';

    // Count target tokens before the attempt
    const tokensBefore = await prisma.refreshToken.count({
      where: { organizationId: orgB.id },
    });

    // Attempt switch-org with valid bearer token and refreshToken supplied ONLY in JSON body (no Cookie header)
    const bodyOnlyRes = await request(app)
      .post('/api/v1/auth/switch-org')
      .set('Authorization', `Bearer ${primaryToken}`)
      .set('Origin', 'http://localhost:3000')
      .set('x-orgsphere-client', 'web')
      .send({
        targetOrganizationId: orgB.id,
        refreshToken: rawRefreshToken,
      });

    // Must be rejected: strict switchOrgSchema forbids extra fields (400) or missing cookie rejects (401)
    expect([400, 401]).toContain(bodyOnlyRes.status);
    expect(bodyOnlyRes.body.success).toBe(false);

    // CRITICAL: Must not issue Set-Cookie header
    const setCookies = bodyOnlyRes.headers['set-cookie'] as unknown as string[] | undefined;
    expect(setCookies).toBeUndefined();

    // CRITICAL: Must not create any replacement token record in the database
    const tokensAfter = await prisma.refreshToken.count({
      where: { organizationId: orgB.id },
    });
    expect(tokensAfter).toBe(tokensBefore);
  });

  it('proves simultaneous /auth/refresh and /auth/switch-org are serialized via row locking without family invalidation', async () => {
    const orgB = await getOrgB();

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: aliceEmail,
        password: 'alice-secure-passphrase-2026!',
      });
    const primaryToken = loginRes.body.data.accessToken;
    const cookieA = loginRes.headers['set-cookie'];

    const alice = await prisma.user.findUniqueOrThrow({ where: { email: aliceEmail } });
    const reuseLogsBefore = await prisma.auditLog.count({
      where: {
        action: 'AUTH_TOKEN_REUSE_DETECTED',
        actorId: alice.id,
      },
    });

    // Send simultaneous /auth/refresh and /auth/switch-org presenting the same refresh cookie
    const [refreshRes, switchRes] = await Promise.all([
      request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookieA)
        .set('Origin', 'http://localhost:3000')
        .set('x-orgsphere-client', 'web'),
      request(app)
        .post('/api/v1/auth/switch-org')
        .set('Authorization', `Bearer ${primaryToken}`)
        .set('Cookie', cookieA)
        .set('Origin', 'http://localhost:3000')
        .set('x-orgsphere-client', 'web')
        .send({ targetOrganizationId: orgB.id }),
    ]);

    // Exactly one operation succeeds (200) and the loser gets 409 CONCURRENT_REFRESH_RACE
    const statuses = [refreshRes.status, switchRes.status].sort();
    expect(statuses).toEqual([200, 409]);

    const winnerRes = refreshRes.status === 200 ? refreshRes : switchRes;
    const loserRes = refreshRes.status === 409 ? refreshRes : switchRes;

    expect(loserRes.body.error.code).toBe('CONCURRENT_REFRESH_RACE');

    // Confirm that the winner's new cookie is completely usable
    const nextRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', winnerRes.headers['set-cookie'])
      .set('Origin', 'http://localhost:3000')
      .set('x-orgsphere-client', 'web');

    expect(nextRefresh.status).toBe(200);
    expect(nextRefresh.body.data.accessToken).toBeDefined();

    // Confirm that no false security reuse detection was triggered during the race
    const reuseLogsAfter = await prisma.auditLog.count({
      where: {
        action: 'AUTH_TOKEN_REUSE_DETECTED',
        actorId: alice.id,
      },
    });
    expect(reuseLogsAfter).toBe(reuseLogsBefore);
  });

  it('proves holding token-row lock across duplicate window causes post-lock request to observe window expiry and trigger replay detection', async () => {
    const orgB = await getOrgB();

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: aliceEmail,
        password: 'alice-secure-passphrase-2026!',
      });
    const primaryToken = loginRes.body.data.accessToken;
    const cookieA = loginRes.headers['set-cookie'];
    const cookieStr = Array.isArray(cookieA) ? cookieA.join(';') : (cookieA as string);
    const match = cookieStr.match(new RegExp(`${getCookieName()}=([^;]+)`));
    const rawRefreshToken = match ? decodeURIComponent(match[1]) : '';
    const tokenHash = hashRefreshToken(rawRefreshToken);

    const initialToken = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash },
    });

    // Create an active successor token in the same family to verify whole-family revocation
    const activeSuccessor = await prisma.refreshToken.create({
      data: {
        tokenHash: hashRefreshToken(`active-successor-token-${Date.now()}`),
        userId: initialToken.userId,
        organizationId: initialToken.organizationId,
        familyId: initialToken.familyId,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    let lockAcquiredResolve: () => void;
    const lockAcquiredPromise = new Promise<void>((resolve) => {
      lockAcquiredResolve = resolve;
    });

    // Holder transaction acquires row lock and revokes the token with ORG_SWITCH
    const holderPromise = prisma.$transaction(
      async (tx) => {
        // 1. Acquire exclusive row lock on the token
        await tx.$queryRaw`
          SELECT id FROM refresh_tokens WHERE token_hash = ${tokenHash} FOR UPDATE
        `;

        // 2. Mark token as rotated/switched at the moment of lock acquisition
        await tx.refreshToken.update({
          where: { id: initialToken.id },
          data: {
            revokedAt: new Date(),
            revocationReason: 'ORG_SWITCH',
          },
        });

        // 3. Signal that lock is held
        lockAcquiredResolve();

        // 4. Deliberately hold the row lock across the 5000ms duplicate window boundary
        await new Promise((resolve) => setTimeout(resolve, 5200));
      },
      { maxWait: 10000, timeout: 15000 }
    );

    // Ensure the holder transaction has acquired the row lock and revoked the token
    await lockAcquiredPromise;

    // Concurrently invoke switch-org with the locked token.
    // PostgreSQL blocks this HTTP request on SELECT ... FOR UPDATE while holderPromise sleeps.
    const competingSwitchPromise = request(app)
      .post('/api/v1/auth/switch-org')
      .set('Authorization', `Bearer ${primaryToken}`)
      .set('Cookie', cookieA)
      .set('Origin', 'http://localhost:3000')
      .set('x-orgsphere-client', 'web')
      .send({ targetOrganizationId: orgB.id });

    // Wait for both to complete
    const [_, competingRes] = await Promise.all([holderPromise, competingSwitchPromise]);

    // Because the decision time is captured AFTER acquiring the row lock (post-5200ms wait),
    // timeSinceRevocation is correctly evaluated as > 5000ms.
    // The request is therefore identified as an expired duplicate / replay attack (401),
    // NOT misidentified as a concurrent race duplicate (409)!
    expect(competingRes.status).toBe(401);
    expect(competingRes.body.error.message).toContain('replay detection');

    // Confirm that the active successor in the family is revoked with SECURITY_REUSE
    const updatedSuccessor = await prisma.refreshToken.findUniqueOrThrow({
      where: { id: activeSuccessor.id },
    });
    expect(updatedSuccessor.revokedAt).not.toBeNull();
    expect(updatedSuccessor.revocationReason).toBe('SECURITY_REUSE');

    // Confirm that AUTH_TOKEN_REUSE_DETECTED was recorded
    const reuseAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'AUTH_TOKEN_REUSE_DETECTED',
        resourceId: initialToken.id,
      },
    });
    expect(reuseAudit).toBeDefined();
  }, 20000);
});
