import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { generateAccessToken, verifyAccessToken } from '../src/utils/token.js';
import { authenticate } from '../src/middlewares/authenticate.js';
import { requireOrgContext } from '../src/middlewares/requireOrgContext.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';

describe('Token Security & Tenant-Binding Enforcement', () => {
  it('issues and verifies valid tenant-bound access tokens', () => {
    const payload = {
      userId: 'user-uuid-1',
      email: 'user1@orgsphere.test',
      organizationId: 'org-uuid-alpha',
      roleId: 'role-uuid-admin',
      platformRole: 'USER',
    };

    const token = generateAccessToken(payload);
    expect(typeof token).toBe('string');

    const verified = verifyAccessToken(token);
    expect(verified.userId).toBe(payload.userId);
    expect(verified.organizationId).toBe(payload.organizationId);
    expect(verified.email).toBe(payload.email);
    expect(verified.roleId).toBe(payload.roleId);
    expect(verified.platformRole).toBe(payload.platformRole);
  });

  it('rejects access tokens without valid Bearer scheme', async () => {
    const app = express();
    app.get('/protected', authenticate, (_req, res) => res.json({ success: true }));
    app.use(errorHandler);

    const resNoAuth = await request(app).get('/protected');
    expect(resNoAuth.status).toBe(401);
    expect(resNoAuth.body.error.code).toBe('UNAUTHENTICATED');

    const resBadScheme = await request(app)
      .get('/protected')
      .set('Authorization', 'Basic dXNlcjpwYXNz');
    expect(resBadScheme.status).toBe(401);
    expect(resBadScheme.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('strictly rejects requests where x-org-id mismatches the access token organizationId (TENANT_MISMATCH)', async () => {
    const app = express();
    app.get('/tenant-endpoint', authenticate, requireOrgContext, (_req, res) => res.json({ success: true }));
    app.use(errorHandler);

    const tokenForOrgAlpha = generateAccessToken({
      userId: 'user-uuid-1',
      email: 'user1@orgsphere.test',
      organizationId: 'org-uuid-alpha',
      roleId: 'role-admin',
      platformRole: 'USER',
    });

    // Caller presents Token for Org Alpha, but passes header x-org-id for Org Beta
    const res = await request(app)
      .get('/tenant-endpoint')
      .set('Authorization', `Bearer ${tokenForOrgAlpha}`)
      .set('x-org-id', 'org-uuid-beta');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('TENANT_MISMATCH');
    expect(res.body.error.message).toContain('does not match x-org-id header');
  });
});
