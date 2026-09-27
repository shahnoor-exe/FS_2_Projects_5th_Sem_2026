import pinoHttp from 'pino-http';
import { logger } from '../config/logger.js';
import { Request } from 'express';

export const httpLogger = pinoHttp({
  logger,
  customProps: (req: Request) => ({
    requestId: req.id,
  }),
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  autoLogging: {
    ignore: (req) => {
      // Don't flood logs with routine health checks
      return req.url === '/api/v1/health' || req.url === '/health';
    },
  },
});
