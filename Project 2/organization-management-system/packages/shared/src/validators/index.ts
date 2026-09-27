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
