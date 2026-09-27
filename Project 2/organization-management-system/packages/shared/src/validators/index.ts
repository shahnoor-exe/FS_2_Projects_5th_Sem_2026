import { z } from 'zod';

export const uuidSchema = z.string().uuid({ message: 'Invalid UUID format' });

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// Common weak/breached passwords blocklist
export const COMMON_PASSWORD_BLOCKLIST = new Set([
  'password1234',
  'password12345',
  'password123456',
  '123456789012',
  'qwertyuiop12',
  'administrator1',
  'welcome123456',
  'orgsphere1234',
  'letmein123456',
  'changeme12345',
]);

// OWASP Length-based password policy: 12-128 chars, permits spaces, Unicode, passphrases
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters long')
  .max(128, 'Password cannot exceed 128 characters')
  .refine(
    (pwd) => !COMMON_PASSWORD_BLOCKLIST.has(pwd.toLowerCase()),
    'Password is too common or easily guessable. Please choose a more unique passphrase.'
  );

// Registration schema: strictly rejects client-supplied platformRole
export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Invalid email address'),
    password: passwordSchema,
    firstName: z.string().trim().min(1, 'First name is required').max(50),
    lastName: z.string().trim().min(1, 'Last name is required').max(50),
    organizationName: z.string().trim().min(2, 'Organization name must be at least 2 characters').max(100),
    phone: z.string().trim().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format').optional(),
  })
  .strict(); // Disallows unknown fields like platformRole or platform_role

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Invalid email address'),
    password: z.string().min(1, 'Password is required').max(128),
    organizationId: uuidSchema.optional(),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;

export const switchOrgSchema = z
  .object({
    targetOrganizationId: uuidSchema,
  })
  .strict();

export type SwitchOrgInput = z.infer<typeof switchOrgSchema>;

// ─── Phase 3 Collection & Domain Validators ───────────────────────────────────

export const collectionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().trim().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().max(100).optional(),
});

export type CollectionQuery = z.infer<typeof collectionQuerySchema>;

// Organization schemas
export const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
    slug: z
      .string()
      .trim()
      .min(3, 'Slug must be at least 3 characters')
      .max(50, 'Slug cannot exceed 50 characters')
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with single hyphens')
      .optional(),
  })
  .strict()
  .refine((data) => data.name !== undefined || data.slug !== undefined, {
    message: 'At least one field (name or slug) must be provided for update',
  });

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

// Department schemas
export const createDepartmentSchema = z
  .object({
    name: z.string().trim().min(2, 'Department name must be at least 2 characters').max(100),
  })
  .strict();

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = z
  .object({
    name: z.string().trim().min(2, 'Department name must be at least 2 characters').max(100),
  })
  .strict();

export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

export const departmentQuerySchema = collectionQuerySchema.extend({
  sortBy: z.enum(['name', 'createdAt']).optional().default('createdAt'),
});

export type DepartmentQuery = z.infer<typeof departmentQuerySchema>;

// Membership schemas
export const addMemberSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Invalid email address'),
    role: z.enum(['ORG_ADMIN', 'MANAGER', 'EMPLOYEE', 'VIEWER']),
  })
  .strict();

export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const updateMemberRoleSchema = z
  .object({
    role: z.enum(['ORG_ADMIN', 'MANAGER', 'EMPLOYEE', 'VIEWER']),
  })
  .strict();

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const updateMemberStatusSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export type UpdateMemberStatusInput = z.infer<typeof updateMemberStatusSchema>;

export const membershipQuerySchema = collectionQuerySchema.extend({
  roleId: uuidSchema.optional(),
  isActive: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        if (val.toLowerCase() === 'true') return true;
        if (val.toLowerCase() === 'false') return false;
      }
      return val;
    }, z.boolean())
    .optional(),
  sortBy: z.enum(['createdAt', 'isActive']).optional().default('createdAt'),
});

export type MembershipQuery = z.infer<typeof membershipQuerySchema>;

// Project schemas
export const projectStatusSchema = z.enum([
  'PLANNING',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
]);

export type ProjectStatusType = z.infer<typeof projectStatusSchema>;

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(2, 'Project name must be at least 2 characters').max(100),
    description: z.string().trim().max(1000).optional().nullable(),
    status: projectStatusSchema.default('PLANNING'),
    startDate: z.string().datetime({ message: 'Invalid start date format' }).optional().nullable(),
    endDate: z.string().datetime({ message: 'Invalid end date format' }).optional().nullable(),
    departmentId: uuidSchema.optional().nullable(),
    ownerId: uuidSchema.optional().nullable(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.endDate) >= new Date(data.startDate);
      }
      return true;
    },
    { message: 'End date must be greater than or equal to start date', path: ['endDate'] }
  );

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(2, 'Project name must be at least 2 characters').max(100).optional(),
    description: z.string().trim().max(1000).optional().nullable(),
    status: projectStatusSchema.optional(),
    startDate: z.string().datetime({ message: 'Invalid start date format' }).optional().nullable(),
    endDate: z.string().datetime({ message: 'Invalid end date format' }).optional().nullable(),
    departmentId: uuidSchema.optional().nullable(),
    ownerId: uuidSchema.optional().nullable(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.endDate) >= new Date(data.startDate);
      }
      return true;
    },
    { message: 'End date must be greater than or equal to start date', path: ['endDate'] }
  );

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const deleteProjectQuerySchema = z.object({
  cascadeTasks: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        return val.toLowerCase() === 'true';
      }
      return Boolean(val);
    }, z.boolean())
    .default(false),
});

export type DeleteProjectQuery = z.infer<typeof deleteProjectQuerySchema>;

export const projectQuerySchema = collectionQuerySchema.extend({
  status: projectStatusSchema.optional(),
  departmentId: uuidSchema.optional(),
  ownerId: uuidSchema.optional(),
  sortBy: z.enum(['name', 'status', 'startDate', 'endDate', 'createdAt']).optional().default('createdAt'),
});

export type ProjectQuery = z.infer<typeof projectQuerySchema>;

// Task schemas
export const taskPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export type TaskPriorityType = z.infer<typeof taskPrioritySchema>;

export const taskStatusSchema = z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']);
export type TaskStatusType = z.infer<typeof taskStatusSchema>;

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(2, 'Task title must be at least 2 characters').max(200),
    description: z.string().trim().max(5000).optional().nullable(),
    priority: taskPrioritySchema.default('MEDIUM'),
    status: taskStatusSchema.default('TODO'),
    dueDate: z.string().datetime({ message: 'Invalid due date format' }).optional().nullable(),
    projectId: uuidSchema,
    assigneeId: uuidSchema.optional().nullable(),
  })
  .strict();

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(5000).optional().nullable(),
    priority: taskPrioritySchema.optional(),
    status: taskStatusSchema.optional(),
    dueDate: z.string().datetime().optional().nullable(),
    projectId: uuidSchema.optional(),
    assigneeId: uuidSchema.optional().nullable(),
  })
  .strict();

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

// Restricted task update schema for employees
export const employeeUpdateTaskSchema = z
  .object({
    status: taskStatusSchema.optional(),
    description: z.string().trim().max(5000).optional().nullable(),
  })
  .strict();

export type EmployeeUpdateTaskInput = z.infer<typeof employeeUpdateTaskSchema>;

export const taskQuerySchema = collectionQuerySchema.extend({
  projectId: uuidSchema.optional(),
  assigneeId: uuidSchema.optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  sortBy: z.enum(['title', 'priority', 'status', 'dueDate', 'createdAt']).optional().default('createdAt'),
});

export type TaskQuery = z.infer<typeof taskQuerySchema>;

// Audit logs schema
export const auditLogsQuerySchema = collectionQuerySchema.extend({
  action: z.string().trim().optional(),
  resourceType: z.string().trim().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  sortBy: z.enum(['createdAt']).optional().default('createdAt'),
});

export type AuditLogsQuery = z.infer<typeof auditLogsQuerySchema>;
