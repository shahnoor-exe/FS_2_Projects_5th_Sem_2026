import { prisma } from '../../config/prisma.js';
import { recordAuditLog } from '../audit/audit.service.js';
import { cacheService } from '../../services/cache.service.js';
import { NotFoundError, ConflictError } from '../../utils/errors.js';
import {
  CreateProjectInput,
  UpdateProjectInput,
  ProjectQuery,
  PaginationMeta,
  ErrorCode,
} from '@orgsphere/shared';

export const projectsService = {
  async listProjects(orgId: string, query: ProjectQuery) {
    const { page, limit, sortBy, sortOrder, status, departmentId, ownerId, search } = query;
    const skip = (page - 1) * limit;

    const where = {
      organizationId: orgId,
      ...(status ? { status } : {}),
      ...(departmentId ? { departmentId } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { description: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ [sortBy || 'createdAt']: sortOrder }, { id: 'asc' }],
        include: {
          department: {
            select: { id: true, name: true },
          },
          owner: {
            select: {
              id: true,
              userId: true,
              user: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
          _count: {
            select: { tasks: true },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    const meta: PaginationMeta = {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };

    const data = items.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      startDate: p.startDate,
      endDate: p.endDate,
      organizationId: p.organizationId,
      departmentId: p.departmentId,
      department: p.department,
      ownerId: p.ownerId,
      owner: p.owner,
      taskCount: p._count.tasks,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return { data, meta };
  },

  async getProject(orgId: string, projectId: string) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: orgId,
      },
      include: {
        department: {
          select: { id: true, name: true },
        },
        owner: {
          select: {
            id: true,
            userId: true,
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
        _count: {
          select: { tasks: true },
        },
      },
    });

    if (!project) {
      throw new NotFoundError('Project not found');
    }

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      startDate: project.startDate,
      endDate: project.endDate,
      organizationId: project.organizationId,
      departmentId: project.departmentId,
      department: project.department,
      ownerId: project.ownerId,
      owner: project.owner,
      taskCount: project._count.tasks,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  },

  async createProject(
    orgId: string,
    input: CreateProjectInput,
    actorUserId?: string,
    ipAddress?: string,
    requestId?: string
  ) {
    // 1. Validate department boundary if provided
    if (input.departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: input.departmentId, organizationId: orgId },
      });
      if (!dept) {
        throw new NotFoundError('Department not found in this organization');
      }
    }

    // 2. Validate owner membership boundary if provided
    if (input.ownerId) {
      const member = await prisma.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: input.ownerId,
            organizationId: orgId,
          },
        },
      });
      if (!member || !member.isActive) {
        throw new NotFoundError('Project owner must be an active member of this organization');
      }
    }

    // 3. Create project
    const project = await prisma.project.create({
      data: {
        name: input.name,
        description: input.description,
        status: input.status || 'PLANNING',
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        organizationId: orgId,
        departmentId: input.departmentId || null,
        ownerId: input.ownerId || null,
      },
      include: {
        department: { select: { id: true, name: true } },
        owner: {
          select: {
            id: true,
            userId: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    // 4. Record append-only audit log
    await recordAuditLog({
      organizationId: orgId,
      actorId: actorUserId,
      action: 'PROJECT_CREATE',
      resourceType: 'Project',
      resourceId: project.id,
      ipAddress,
      requestId,
      metadata: {
        name: project.name,
        status: project.status,
        departmentId: project.departmentId,
        ownerId: project.ownerId,
      },
    });

    await Promise.all([
      cacheService.bumpGeneration(orgId, 'dashboard'),
      cacheService.bumpGeneration(orgId, 'departments'),
    ]);

    return project;
  },

  async updateProject(
    orgId: string,
    projectId: string,
    input: UpdateProjectInput,
    actorUserId?: string,
    ipAddress?: string,
    requestId?: string
  ) {
    const existing = await prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
    });

    if (!existing) {
      throw new NotFoundError('Project not found');
    }

    if (input.departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: input.departmentId, organizationId: orgId },
      });
      if (!dept) {
        throw new NotFoundError('Department not found in this organization');
      }
    }

    if (input.ownerId) {
      const member = await prisma.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: input.ownerId,
            organizationId: orgId,
          },
        },
      });
      if (!member || !member.isActive) {
        throw new NotFoundError('Project owner must be an active member of this organization');
      }
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.startDate !== undefined
          ? { startDate: input.startDate ? new Date(input.startDate) : null }
          : {}),
        ...(input.endDate !== undefined
          ? { endDate: input.endDate ? new Date(input.endDate) : null }
          : {}),
        ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
        ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
      },
      include: {
        department: { select: { id: true, name: true } },
        owner: {
          select: {
            id: true,
            userId: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    await recordAuditLog({
      organizationId: orgId,
      actorId: actorUserId,
      action: 'PROJECT_UPDATE',
      resourceType: 'Project',
      resourceId: updated.id,
      ipAddress,
      requestId,
      metadata: {
        updatedFields: Object.keys(input),
      },
    });

    await Promise.all([
      cacheService.bumpGeneration(orgId, 'dashboard'),
      cacheService.bumpGeneration(orgId, 'departments'),
    ]);

    return updated;
  },

  async deleteProject(
    orgId: string,
    projectId: string,
    cascadeTasks: boolean,
    actorUserId?: string,
    ipAddress?: string,
    requestId?: string
  ) {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Lock the project row
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM projects WHERE id = ${projectId} AND organization_id = ${orgId} FOR UPDATE
      `;

      if (locked.length === 0) {
        throw new NotFoundError('Project not found');
      }

      // 2. Count active tasks
      const taskCount = await tx.task.count({
        where: { projectId, organizationId: orgId },
      });

      if (taskCount > 0 && !cascadeTasks) {
        throw new ConflictError(
          `Cannot delete project with ${taskCount} active task(s). Explicit cascadeTasks=true confirmation required.`,
          ErrorCode.PROJECT_HAS_TASKS,
          { taskCount }
        );
      }

      // 3. If cascadeTasks requested, explicitly delete tasks within tx to capture actual deleted count
      let actualDeletedTasks = 0;
      if (taskCount > 0 && cascadeTasks) {
        const delResult = await tx.task.deleteMany({
          where: { projectId, organizationId: orgId },
        });
        actualDeletedTasks = delResult.count;
      }

      // 4. Delete project
      await tx.project.delete({
        where: { id: projectId },
      });

      // 5. Record append-only audit log within transaction
      await recordAuditLog({
        organizationId: orgId,
        actorId: actorUserId,
        action: 'PROJECT_DELETE',
        resourceType: 'Project',
        resourceId: projectId,
        ipAddress,
        requestId,
        metadata: {
          tasksCascadeDeletedCount: actualDeletedTasks,
        },
        tx,
      });

      return {
        success: true,
        id: projectId,
        tasksCascadeDeletedCount: actualDeletedTasks,
      };
    });

    await Promise.all([
      cacheService.bumpGeneration(orgId, 'dashboard'),
      cacheService.bumpGeneration(orgId, 'departments'),
    ]);

    return result;
  },
};
