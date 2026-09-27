import crypto from 'crypto';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

export type CacheSource = 'HIT' | 'MISS' | 'BYPASS';

export interface CacheResult<T> {
  data: T;
  source: CacheSource;
}

const GENERATION_KEY_TTL_SECONDS = 86400; // 24 hours

export const cacheService = {
  /**
   * Resolves the current generation token for a tenant's cache namespace.
   * If the generation key is missing (e.g. after eviction or initial state),
   * initializes it atomically with a fresh random UUID via SET ... NX.
   *
   * Note on UUID safety:
   * UUID collisions (using RFC 4122 v4 122 bits of pseudo-randomness) are treated
   * as negligibly unlikely across operational generations, rather than theoretically impossible.
   */
  async getGeneration(
    orgId: string,
    namespace: 'dashboard' | 'departments'
  ): Promise<string> {
    if (!redis || redis.status !== 'ready') {
      return crypto.randomUUID();
    }

    const genKey = `org:${orgId}:${namespace}:gen`;

    try {
      const existing = await redis.get(genKey);
      if (existing) {
        return existing;
      }

      // Generation key is missing/evicted; initialize atomically with fresh UUID
      const newGen = crypto.randomUUID();
      const wasSet = await redis.set(genKey, newGen, 'EX', GENERATION_KEY_TTL_SECONDS, 'NX');
      if (wasSet === 'OK') {
        return newGen;
      }

      // If another concurrent request initialized it first, read their token
      const concurrentGen = await redis.get(genKey);
      return concurrentGen || newGen;
    } catch (err) {
      logger.warn({ err, orgId, namespace }, 'Failed to resolve cache generation from Redis; using ephemeral token');
      return crypto.randomUUID();
    }
  },

  /**
   * Bumps the generation for a tenant's cache namespace upon a post-commit mutation.
   * Atomically rotates the active generation to a freshly generated UUID in a single SET command.
   *
   * Multi-instance & out-of-order invalidation safety:
   * Each successful invalidation establishes a completely fresh UUID namespace.
   * If an invalidation from a concurrent or earlier mutation completes out-of-order,
   * it simply sets a new, previously unexposed UUID namespace, triggering an extra
   * cache miss that loads fresh database state. It never republishes or resurrects
   * an older generation's cached payload. Old payloads remain quarantined under their
   * previous UUID keys until TTL expiry.
   */
  async bumpGeneration(
    orgId: string,
    namespace: 'dashboard' | 'departments'
  ): Promise<string> {
    if (!redis || redis.status !== 'ready') {
      return crypto.randomUUID();
    }

    const genKey = `org:${orgId}:${namespace}:gen`;
    const newGen = crypto.randomUUID();

    try {
      await redis.set(genKey, newGen, 'EX', GENERATION_KEY_TTL_SECONDS);
      return newGen;
    } catch (err) {
      logger.error(
        { err, orgId, namespace },
        'Cache generation bump failed; existing entries may remain until TTL'
      );
      return newGen;
    }
  },

  /**
   * Generic, resilient cache-aside execution wrapper.
   * - If Redis read fails or Redis is down -> falls back to fetchFn() with source 'BYPASS'.
   * - If cache hit -> returns parsed JSON with source 'HIT'.
   * - If cache miss -> executes fetchFn().
   * - If cache write succeeds -> returns data with source 'MISS'.
   * - If cache write fails after DB read -> logs warning, returns DB data cleanly with source 'BYPASS' (never 500).
   */
  async getOrSet<T>(params: {
    key: string;
    ttlSeconds: number;
    fetchFn: () => Promise<T>;
  }): Promise<CacheResult<T>> {
    const { key, ttlSeconds, fetchFn } = params;

    // 1. If Redis is unavailable, bypass directly to database
    if (!redis || redis.status !== 'ready') {
      const data = await fetchFn();
      return { data, source: 'BYPASS' };
    }

    // 2. Try read from Redis
    try {
      const cached = await redis.get(key);
      if (cached) {
        return { data: JSON.parse(cached) as T, source: 'HIT' };
      }
    } catch (err) {
      logger.warn({ err, key }, 'Redis cache read failed; bypassing to database');
      const data = await fetchFn();
      return { data, source: 'BYPASS' };
    }

    // 3. Cache Miss: Execute live database query
    const data = await fetchFn();

    // 4. Try write back to Redis (non-fatal if write fails)
    try {
      await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
      return { data, source: 'MISS' };
    } catch (err) {
      logger.warn({ err, key }, 'Redis cache write failed after database read; serving uncached data');
      return { data, source: 'BYPASS' };
    }
  },
};
