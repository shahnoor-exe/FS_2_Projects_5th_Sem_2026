import { SystemRoleType, PlatformRoleType } from '@orgsphere/shared';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  platformRole: PlatformRoleType;
}

export interface CurrentOrganization {
  id: string;
  name: string;
  slug: string;
  role: SystemRoleType;
}

export interface AccessibleOrganization {
  id: string;
  name: string;
  slug: string;
  role: SystemRoleType;
}

export interface Department {
  id: string;
  name: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    projects: number;
  };
}

export interface MemberUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface RoleInfo {
  id: string;
  name: SystemRoleType;
  description?: string;
}

export interface Membership {
  id: string;
  userId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  role: RoleInfo;
  user: MemberUser;
}

export type ProjectStatus = 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  startDate?: string | null;
  endDate?: string | null;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
  ownerId?: string | null;
  owner?: { id: string; firstName: string; lastName: string; email: string } | null;
  _count?: {
    tasks: number;
  };
  createdAt: string;
  updatedAt: string;
}

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';

export interface TaskAssignee {
  id: string;
  userId?: string;
  user?: { id: string; firstName: string; lastName: string; email: string };
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  projectId: string;
  project?: { id: string; name: string };
  assigneeId?: string | null;
  assignee?: TaskAssignee | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  actorId: string;
  actor?: { id: string; firstName: string; lastName: string; email: string } | null;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface DashboardMetrics {
  members: {
    total: number;
    byRole: {
      orgAdmin: number;
      manager: number;
      employee: number;
      viewer: number;
    };
  };
  departments: {
    total: number;
  };
  projects: {
    total: number;
    byStatus: {
      planning: number;
      inProgress: number;
      onHold: number;
      completed: number;
      cancelled: number;
    };
  };
  tasks: {
    total: number;
    byStatus: {
      todo: number;
      inProgress: number;
      inReview: number;
      done: number;
    };
    byPriority: {
      low: number;
      medium: number;
      high: number;
      urgent: number;
    };
    overdueCount: number;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}
