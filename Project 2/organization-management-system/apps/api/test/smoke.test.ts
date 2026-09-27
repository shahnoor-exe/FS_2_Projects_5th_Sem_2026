import { describe, it, expect } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../src/app.js';

describe('Phase 1 Foundation Smoke Tests', () => {
  const app = createApp();

  describe('GET /api/v1/health', () => {
    it('returns 200 OK with success envelope and correlation ID', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('x-request-id', 'test-correlation-1234');

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe('test-correlation-1234');
      expect(res.body).toEqual({
        success: true,
        data: {
          status: 'ok',
          timestamp: expect.any(String),
          uptime: expect.any(Number),
        },
      });
    });
  });

  describe('GET /api/v1/ready', () => {
    it('returns 200 OK when database is healthy', async () => {
      const res = await request(app).get('/api/v1/ready');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ready');
      expect(res.body.data.checks.database).toBe('healthy');
      expect(['healthy', 'unavailable']).toContain(res.body.data.checks.redis);
    });
  });

  describe('GET /api/v1/version', () => {
    it('returns 200 OK with service and version information', async () => {
      const res = await request(app).get('/api/v1/version');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.service).toBe('orgsphere-api');
      expect(res.body.data.version).toBe('1.0.0');
    });
  });

  describe('GET /api/v1/docs/openapi.json', () => {
    it('returns the valid OpenAPI 3.0 specification document', async () => {
      const res = await request(app).get('/api/v1/docs/openapi.json');

      expect(res.status).toBe(200);
      expect(res.body.openapi).toBe('3.0.3');
      expect(res.body.info.title).toContain('OrgSphere');
      expect(res.body.paths).toHaveProperty('/health');
      expect(res.body.paths).toHaveProperty('/ready');
      expect(res.body.paths).toHaveProperty('/version');
    });
  });

  describe('404 Not Found & Error Envelope', () => {
    it('returns 404 with standardized error envelope for non-existent routes', async () => {
      const res = await request(app).get('/api/v1/unknown-endpoint');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
      expect(res.body.error).toHaveProperty('message');
      expect(res.body.error).toHaveProperty('requestId');
    });
  });

  describe('Multi-Tenant Schema Isolation Constraints', () => {
    it('enforces composite foreign keys and composite uniqueness across all 11 entities in schema.prisma', () => {
      const schemaPath = path.resolve(__dirname, '../prisma/schema.prisma');
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');

      // 1. Verify all 11 entities exist in the schema
      const entities = [
        'model User',
        'model Organization',
        'model OrganizationMembership',
        'model Role',
        'model Permission',
        'model RolePermission',
        'model Department',
        'model Project',
        'model Task',
        'model RefreshToken',
        'model AuditLog',
      ];
      for (const entity of entities) {
        expect(schemaContent).toContain(entity);
      }

      // 2. Verify Composite Uniqueness for Tenant Boundary Scoping
      expect(schemaContent).toContain('@@unique([id, organizationId])');
      expect(schemaContent).toContain('@@unique([userId, organizationId])');

      // 3. Verify Composite Foreign Keys preventing cross-tenant links
      // Project -> Department within same org
      expect(schemaContent).toMatch(
        /department\s+Department\?\s+@relation\(fields:\s*\[departmentId,\s*organizationId\],\s*references:\s*\[id,\s*organizationId\]/
      );
      // Project -> Owner membership within same org
      expect(schemaContent).toMatch(
        /owner\s+OrganizationMembership\?\s+@relation\(fields:\s*\[ownerId,\s*organizationId\],\s*references:\s*\[userId,\s*organizationId\]/
      );
      // Task -> Project within same org
      expect(schemaContent).toMatch(
        /project\s+Project\s+@relation\(fields:\s*\[projectId,\s*organizationId\],\s*references:\s*\[id,\s*organizationId\]/
      );
      // Task -> Assignee membership within same org
      expect(schemaContent).toMatch(
        /assignee\s+OrganizationMembership\?\s+@relation\(fields:\s*\[assigneeId,\s*organizationId\],\s*references:\s*\[userId,\s*organizationId\]/
      );
    });
  });
});
