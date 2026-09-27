import { prisma } from '../../config/prisma.js';
import { cacheService, CacheResult } from '../../services/cache.service.js';
import { SystemRole } from '@orgsphere/shared';

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

const DASHBOARD_CACHE_TTL_SECONDS = 300; // 5 minutes

export const dashboardService = {
  async getMetrics(orgId: string): Promise<CacheResult<DashboardMetrics>> {
    const gen = await cacheService.getGeneration(orgId, 'dashboard');
    const cacheKey = `org:${orgId}:dashboard:v${gen}:metrics`;

    return cacheService.getOrSet<DashboardMetrics>({
      key: cacheKey,
      ttlSeconds: DASHBOARD_CACHE_TTL_SECONDS,
      fetchFn: async () => {
        const now = new Date();

        // 1. Members aggregation (strictly counting ACTIVE memberships)
        const activeMemberships = await prisma.organizationMembership.findMany({
          where: { organizationId: orgId, isActive: true },
          select: { role: { select: { name: true } } },
        });

        const memberCounts = {
          total: activeMemberships.length,
          byRole: {
            orgAdmin: 0,
            manager: 0,
            employee: 0,
            viewer: 0,
          },
        };

        for (const m of activeMemberships) {
          if (m.role.name === SystemRole.ORG_ADMIN) memberCounts.byRole.orgAdmin++;
          else if (m.role.name === SystemRole.MANAGER) memberCounts.byRole.manager++;
          else if (m.role.name === SystemRole.EMPLOYEE) memberCounts.byRole.employee++;
          else if (m.role.name === SystemRole.VIEWER) memberCounts.byRole.viewer++;
        }

        // 2. Departments count
        const departmentCount = await prisma.department.count({
          where: { organizationId: orgId },
        });

        // 3. Projects grouping by status
        const projects = await prisma.project.findMany({
          where: { organizationId: orgId },
          select: { status: true },
        });

        const projectCounts = {
          total: projects.length,
          byStatus: {
            planning: 0,
            inProgress: 0,
            onHold: 0,
            completed: 0,
            cancelled: 0,
          },
        };

        for (const p of projects) {
          const s = p.status.toUpperCase();
          if (s === 'PLANNING') projectCounts.byStatus.planning++;
          else if (s === 'IN_PROGRESS') projectCounts.byStatus.inProgress++;
          else if (s === 'ON_HOLD') projectCounts.byStatus.onHold++;
          else if (s === 'COMPLETED') projectCounts.byStatus.completed++;
          else if (s === 'CANCELLED') projectCounts.byStatus.cancelled++;
        }

        // 4. Tasks grouping by status and priority, plus overdue calculation
        const tasks = await prisma.task.findMany({
          where: { organizationId: orgId },
          select: { status: true, priority: true, dueDate: true },
        });

        const taskCounts = {
          total: tasks.length,
          byStatus: {
            todo: 0,
            inProgress: 0,
            inReview: 0,
            done: 0,
          },
          byPriority: {
            low: 0,
            medium: 0,
            high: 0,
            urgent: 0,
          },
          overdueCount: 0,
        };

        for (const t of tasks) {
          const s = t.status.toUpperCase();
          if (s === 'TODO') taskCounts.byStatus.todo++;
          else if (s === 'IN_PROGRESS') taskCounts.byStatus.inProgress++;
          else if (s === 'IN_REVIEW') taskCounts.byStatus.inReview++;
          else if (s === 'DONE') taskCounts.byStatus.done++;

          const p = t.priority.toUpperCase();
          if (p === 'LOW') taskCounts.byPriority.low++;
          else if (p === 'MEDIUM') taskCounts.byPriority.medium++;
          else if (p === 'HIGH') taskCounts.byPriority.high++;
          else if (p === 'URGENT') taskCounts.byPriority.urgent++;

          if (t.dueDate && t.dueDate < now && s !== 'DONE') {
            taskCounts.overdueCount++;
          }
        }

        return {
          members: memberCounts,
          departments: { total: departmentCount },
          projects: projectCounts,
          tasks: taskCounts,
        };
      },
    });
  },
};
