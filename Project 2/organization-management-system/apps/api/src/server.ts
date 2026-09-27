import { initTracing, shutdownTracing } from './config/tracing.js';

// Initialize tracing before application modules load
initTracing();

import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './config/prisma.js';
import { redis } from './config/redis.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, `OrgSphere API server listening on http://localhost:${env.PORT}`);
  logger.info(`Interactive API Documentation: http://localhost:${env.PORT}/api/v1/docs`);
});

// Graceful shutdown
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Graceful shutdown initiated');

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await prisma.$disconnect();
      logger.info('Prisma client disconnected');
    } catch (err) {
      logger.error({ err }, 'Error disconnecting Prisma');
    }

    if (redis) {
      try {
        await redis.quit();
        logger.info('Redis client disconnected');
      } catch (err) {
        logger.error({ err }, 'Error disconnecting Redis');
      }
    }

    await shutdownTracing();

    logger.info('OrgSphere API shutdown complete');
    process.exit(0);
  });

  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
