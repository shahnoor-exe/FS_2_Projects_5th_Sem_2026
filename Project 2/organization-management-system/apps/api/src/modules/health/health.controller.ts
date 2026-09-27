import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma.js';
import { checkRedisHealth } from '../../config/redis.js';
import { env } from '../../config/env.js';
import { sendSuccess } from '../../utils/response.js';
import { DatabaseUnavailableError } from '../../utils/errors.js';

export async function getHealth(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}

export async function getReady(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // 1. Database Check (Hard Dependency: 503 if unavailable)
    let dbStatus: 'healthy' | 'unhealthy' = 'healthy';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'unhealthy';
      throw new DatabaseUnavailableError('PostgreSQL database connection check failed');
    }

    // 2. Redis Check (Optional Cache Dependency in Phase 1: 200 OK even if unavailable)
    const redisStatus = await checkRedisHealth();

    sendSuccess(res, {
      status: 'ready',
      checks: {
        database: dbStatus,
        redis: redisStatus,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getVersion(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, {
    service: env.OTEL_SERVICE_NAME,
    version: '1.0.0',
    environment: env.NODE_ENV,
  });
}
