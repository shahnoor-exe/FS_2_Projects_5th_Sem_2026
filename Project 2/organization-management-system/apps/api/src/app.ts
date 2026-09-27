import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { requestIdMiddleware } from './middlewares/requestId.js';
import { httpLogger } from './middlewares/httpLogger.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFoundHandler } from './middlewares/notFoundHandler.js';
import apiRouter from './routes/index.js';

export function createApp(): Express {
  const app = express();

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    })
  );

  // CORS
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  );

  // Body parsers
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Correlation ID and HTTP logging
  app.use(requestIdMiddleware);
  app.use(httpLogger);

  // Primary API router
  app.use('/api/v1', apiRouter);

  // 404 and Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
