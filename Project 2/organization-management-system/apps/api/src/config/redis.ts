import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

let redisClient: Redis | null = null;
let isRedisAvailable = false;

try {
  redisClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 3) {
        return null; // Stop continuous retry spam if Redis is offline
      }
      return Math.min(times * 100, 1000);
    },
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  redisClient.on('connect', () => {
    isRedisAvailable = true;
    logger.info('Connected to Redis');
  });

  redisClient.on('error', (err) => {
    isRedisAvailable = false;
    logger.debug({ err: err.message }, 'Redis connection status: unavailable');
  });

  redisClient.connect().catch((err) => {
    isRedisAvailable = false;
    logger.debug({ err: err.message }, 'Initial Redis connection attempt skipped / unavailable');
  });
} catch (error) {
  isRedisAvailable = false;
  logger.warn({ err: error }, 'Failed to instantiate Redis client');
}

export const redis = redisClient;

export async function checkRedisHealth(): Promise<'healthy' | 'unavailable' | 'disabled'> {
  if (!redis) {
    return 'disabled';
  }
  try {
    const res = await redis.ping();
    return res === 'PONG' ? 'healthy' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
