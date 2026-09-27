import { PrismaClient } from '@prisma/client';
import { env } from './env.js';
import { logger } from './logger.js';

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

prisma.$connect()
  .then(() => {
    logger.info('Prisma connected to PostgreSQL');
  })
  .catch((err) => {
    logger.warn({ err: err.message }, 'Initial PostgreSQL connection deferred / unavailable');
  });
