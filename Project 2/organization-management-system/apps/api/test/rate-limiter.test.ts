import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRateLimiter } from '../src/middlewares/rateLimiter.js';
import * as redisModule from '../src/config/redis.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';

describe('Rate Limiter — In-Memory Per-Process Fallback Resilience', () => {
  it('enforces rate limits per process when falling back to memory store during Redis outage', async () => {
    // Mock Redis as unavailable to strictly exercise in-memory fallback
    const redisSpy = vi.spyOn(redisModule, 'redis', 'get').mockReturnValue(null as any);

    const app = express();
    app.use(express.json());

    const uniqueId = `client-${Date.now()}-${Math.random()}`;
    const limiter = createRateLimiter({
      keyPrefix: 'fallback-test',
      windowMs: 10000,
      max: 3,
      keyGenerator: () => uniqueId,
    });

    app.get('/test-fallback-rate-limit', limiter, (_req, res) => {
      res.json({ success: true, message: 'ok' });
    });
    app.use(errorHandler);

    // Requests 1, 2, 3 should succeed
    const res1 = await request(app).get('/test-fallback-rate-limit');
    expect(res1.status).toBe(200);

    const res2 = await request(app).get('/test-fallback-rate-limit');
    expect(res2.status).toBe(200);

    const res3 = await request(app).get('/test-fallback-rate-limit');
    expect(res3.status).toBe(200);

    // Request 4 should be rate limited via in-memory fallback
    const res4 = await request(app).get('/test-fallback-rate-limit');
    expect(res4.status).toBe(429);
    expect(res4.body.success).toBe(false);
    expect(res4.body.error.code).toBe('RATE_LIMITED');
    expect(res4.headers).toHaveProperty('retry-after');

    redisSpy.mockRestore();
  });

  it('enforces production rate-limit thresholds (max: 5) with exact headers and 429 rejection', async () => {
    const app = express();
    app.use(express.json());

    const uniqueId = `prod-test-${Date.now()}-${Math.random()}`;
    const limiter = createRateLimiter({
      keyPrefix: 'prod-limit-test',
      windowMs: 60000,
      max: 5,
      keyGenerator: () => uniqueId,
    });

    app.get('/test-prod-limit', limiter, (_req, res) => {
      res.json({ success: true });
    });
    app.use(errorHandler);

    // First 5 requests should pass with decrementing remaining counts
    for (let i = 1; i <= 5; i++) {
      const res = await request(app).get('/test-prod-limit');
      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBe('5');
      expect(res.headers['x-ratelimit-remaining']).toBe(String(5 - i));
    }

    // 6th request must be rejected with 429
    const res6 = await request(app).get('/test-prod-limit');
    expect(res6.status).toBe(429);
    expect(res6.body.error.code).toBe('RATE_LIMITED');
    expect(res6.headers).toHaveProperty('retry-after');

    // Surgically clean up test key in Redis
    if (redisModule.redis && redisModule.redis.status === 'ready') {
      await redisModule.redis.del(`ratelimit:prod-limit-test:${uniqueId}`);
    }
  });
});
