import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import healthRoutes from '../modules/health/health.routes.js';
import authRoutes from '../modules/auth/auth.routes.js';
import { openApiSpec } from '../docs/openapi.js';

const router = Router();

// Health & Status
router.use('/', healthRoutes);

// Authentication & Session Lifecycle
router.use('/auth', authRoutes);

// Raw OpenAPI Specification (Must precede swaggerUi middleware)
router.get('/docs/openapi.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(openApiSpec);
});

// Swagger Interactive UI
router.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

export default router;
