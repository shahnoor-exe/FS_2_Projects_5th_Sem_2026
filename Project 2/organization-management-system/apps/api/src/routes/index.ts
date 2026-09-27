import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import healthRoutes from '../modules/health/health.routes.js';
import authRoutes from '../modules/auth/auth.routes.js';
import organizationsRoutes from '../modules/organizations/organizations.routes.js';
import departmentsRoutes from '../modules/departments/departments.routes.js';
import membershipsRoutes from '../modules/users/memberships.routes.js';
import projectsRoutes from '../modules/projects/projects.routes.js';
import tasksRoutes from '../modules/tasks/tasks.routes.js';
import auditLogsRoutes from '../modules/audit-logs/audit-logs.routes.js';
import { openApiSpec } from '../docs/openapi.js';

const router = Router();

// Health & Status
router.use('/', healthRoutes);

// Authentication & Session Lifecycle
router.use('/auth', authRoutes);

// Domain Modules (Phase 3)
router.use('/organizations', organizationsRoutes);
router.use('/departments', departmentsRoutes);
router.use('/memberships', membershipsRoutes);
router.use('/projects', projectsRoutes);
router.use('/tasks', tasksRoutes);
router.use('/audit-logs', auditLogsRoutes);

// Raw OpenAPI Specification (Must precede swaggerUi middleware)
router.get('/docs/openapi.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(openApiSpec);
});

// Swagger Interactive UI
router.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

export default router;
