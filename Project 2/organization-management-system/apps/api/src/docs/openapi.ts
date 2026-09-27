export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'OrgSphere API Specification',
    version: '1.0.0',
    description: 'OrgSphere — Secure Multi-Organization Management System REST API',
    contact: {
      name: 'OrgSphere Engineering Team',
    },
  },
  servers: [
    {
      url: '/api/v1',
      description: 'Primary API Gateway',
    },
  ],
  paths: {
    '/health': {
      get: {
        summary: 'System Liveness Probe',
        description: 'Returns 200 OK when the process is up and listening.',
        tags: ['Health'],
        responses: {
          '200': {
            description: 'Process healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'ok' },
                        timestamp: { type: 'string', format: 'date-time' },
                        uptime: { type: 'number', example: 42.1 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/ready': {
      get: {
        summary: 'System Readiness Probe',
        description: 'Verifies PostgreSQL database connectivity (hard dependency) and Redis status.',
        tags: ['Health'],
        responses: {
          '200': {
            description: 'System is ready to serve traffic',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'ready' },
                        checks: {
                          type: 'object',
                          properties: {
                            database: { type: 'string', example: 'healthy' },
                            redis: { type: 'string', example: 'healthy' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '503': {
            description: 'Database unavailable',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    error: {
                      type: 'object',
                      properties: {
                        code: { type: 'string', example: 'DATABASE_UNAVAILABLE' },
                        message: { type: 'string', example: 'PostgreSQL database connection check failed' },
                        requestId: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/version': {
      get: {
        summary: 'API Version Information',
        tags: ['Health'],
        responses: {
          '200': {
            description: 'Version payload',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        service: { type: 'string', example: 'orgsphere-api' },
                        version: { type: 'string', example: '1.0.0' },
                        environment: { type: 'string', example: 'development' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
