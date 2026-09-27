import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import * as redisModule from '../src/config/redis.js';

describe('GET /api/v1/ready — Health & Dependency Probes', () => {
  const app = createApp();

  it('returns 200 OK with healthy database and healthy redis under standard conditions', async () => {
    const res = await request(app).get('/api/v1/ready');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.checks.database).toBe('healthy');
    expect(res.body.data.checks.redis).toBe('healthy');
  });

  it('returns 200 OK when Redis is unavailable (degraded cache mode — non-blocking)', async () => {
    // Mock Redis health check failure
    const spy = vi.spyOn(redisModule, 'checkRedisHealth').mockResolvedValueOnce('unavailable');

    const res = await request(app).get('/api/v1/ready');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.checks.database).toBe('healthy');
    expect(res.body.data.checks.redis).toBe('unavailable');

    spy.mockRestore();
  });

  it('returns 503 Service Unavailable when PostgreSQL database check fails (hard dependency)', async () => {
    // Mock Prisma queryRaw rejection
    const spy = vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('Connection terminated'));

    const res = await request(app).get('/api/v1/ready');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(res.body.error.message).toContain('database connection check failed');

    spy.mockRestore();
  });
});
