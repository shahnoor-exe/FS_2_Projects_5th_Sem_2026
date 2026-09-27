import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { RateLimitExceededError } from '../utils/errors.js';

interface MemoryRateLimitRecord {
  timestamps: number[];
}

// In-memory per-process fallback store when Redis is unavailable
const memoryStore = new Map<string, MemoryRateLimitRecord>();

// Cleanup stale memory records every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    record.timestamps = record.timestamps.filter((ts) => now - ts < 3600000);
    if (record.timestamps.length === 0) {
      memoryStore.delete(key);
    }
  }
}, 60000).unref();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
  keyGenerator?: (req: Request) => string;
}

function defaultKeyGenerator(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  return ip;
}

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max, keyPrefix, keyGenerator = defaultKeyGenerator } = options;

  return async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    const identifier = keyGenerator(req);
    const key = `ratelimit:${keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    let isRedisAvailable = false;
    try {
      if (redis && redis.status === 'ready') {
        isRedisAvailable = true;
      }
    } catch {
      isRedisAvailable = false;
    }

    if (isRedisAvailable && redis) {
      try {
        const pipeline = redis.pipeline();
        pipeline.zremrangebyscore(key, 0, windowStart);
        pipeline.zadd(key, now, `${now}-${Math.random()}`);
        pipeline.zcard(key);
        pipeline.expire(key, Math.ceil(windowMs / 1000));

        const results = await pipeline.exec();
        const count = results?.[2]?.[1] as number;

        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));

        if (count > max) {
          const retryAfterSec = Math.ceil(windowMs / 1000);
          res.setHeader('Retry-After', retryAfterSec);
          return next(
            new RateLimitExceededError(`Too many requests for ${keyPrefix}. Please retry in ${retryAfterSec} seconds.`)
          );
        }

        return next();
      } catch (err) {
        logger.warn({ err }, 'Redis rate limiter query failed; falling back to in-memory per-process rate limiter');
      }
    }

    // In-memory sliding-window per-process fallback
    let record = memoryStore.get(key);
    if (!record) {
      record = { timestamps: [] };
      memoryStore.set(key, record);
    }

    // Filter out timestamps outside window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);
    record.timestamps.push(now);

    const count = record.timestamps.length;
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));

    if (count > max) {
      const retryAfterSec = Math.ceil(windowMs / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return next(
        new RateLimitExceededError(`Too many requests for ${keyPrefix}. Please retry in ${retryAfterSec} seconds.`, {
          storage: 'in-memory-fallback',
        })
      );
    }

    next();
  };
}

export function resetRateLimits() {
  memoryStore.clear();
}

// Preset limiters (strict in production/development, relaxed in test to avoid blocking integration test suites)
const isTest = process.env.NODE_ENV === 'test';

export const loginRateLimiter = createRateLimiter({
  keyPrefix: 'login',
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 100 : 5,    // 5 attempts per window (relaxed in test)
  keyGenerator: (req) => `${req.ip}_${(req.body?.email || '').toLowerCase()}`,
});

export const registerRateLimiter = createRateLimiter({
  keyPrefix: 'register',
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isTest ? 100 : 3,    // 3 registrations per hour per IP (relaxed in test)
});

export const refreshRateLimiter = createRateLimiter({
  keyPrefix: 'refresh',
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 100 : 30,   // 30 refreshes per window per IP (relaxed in test)
});
