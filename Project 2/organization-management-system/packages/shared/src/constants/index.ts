export const PlatformRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  USER: 'USER',
} as const;

export type PlatformRoleType = (typeof PlatformRole)[keyof typeof PlatformRole];

export const SystemRole = {
  ORG_ADMIN: 'ORG_ADMIN',
  MANAGER: 'MANAGER',
  EMPLOYEE: 'EMPLOYEE',
  VIEWER: 'VIEWER',
} as const;

export type SystemRoleType = (typeof SystemRole)[keyof typeof SystemRole];

export const PermissionAction = {
  ORG_MANAGE: 'org:manage',
  ORG_READ: 'org:read',
  DEPT_MANAGE: 'dept:manage',
  DEPT_READ: 'dept:read',
  MEMBER_MANAGE: 'member:manage',
  MEMBER_READ: 'member:read',
  PROJECT_MANAGE: 'project:manage',
  PROJECT_READ: 'project:read',
  TASK_MANAGE: 'task:manage',
  TASK_READ: 'task:read',
  TASK_UPDATE_ASSIGNED: 'task:update_assigned',
  AUDIT_READ: 'audit:read',
} as const;

export type PermissionActionType = (typeof PermissionAction)[keyof typeof PermissionAction];

export const ErrorCode = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  ACCOUNT_DEACTIVATED: 'ACCOUNT_DEACTIVATED',
  MEMBERSHIP_DEACTIVATED: 'MEMBERSHIP_DEACTIVATED',
  ORGANIZATION_DEACTIVATED: 'ORGANIZATION_DEACTIVATED',
  CONCURRENT_REFRESH_RACE: 'CONCURRENT_REFRESH_RACE',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  MEMBERSHIP_ALREADY_EXISTS: 'MEMBERSHIP_ALREADY_EXISTS',
  DEPARTMENT_HAS_PROJECTS: 'DEPARTMENT_HAS_PROJECTS',
  PROJECT_HAS_TASKS: 'PROJECT_HAS_TASKS',
  SLUG_ALREADY_EXISTS: 'SLUG_ALREADY_EXISTS',
  DEPARTMENT_NAME_EXISTS: 'DEPARTMENT_NAME_EXISTS',
  LAST_ADMIN_PROTECTION: 'LAST_ADMIN_PROTECTION',
  FORBIDDEN_NOT_ASSIGNED_TASK: 'FORBIDDEN_NOT_ASSIGNED_TASK',
  FORBIDDEN_FIELD_UPDATE: 'FORBIDDEN_FIELD_UPDATE',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];
