import { prisma } from '../../config/prisma.js';
import { recordAuditLog } from '../audit/audit.service.js';
import { NotFoundError, AuthorizationError } from '../../utils/errors.js';
import {
  CreateTaskInput,
  UpdateTaskInput,
  TaskQuery,
  PaginationMeta,
  PermissionAction,
  ErrorCode,
} from '@orgsphere/shared';

export const tasksService = {
  async listTasks(orgId: string, query: TaskQuery) {
    const { page, limit, sortBy, sortOrder, projectId, assigneeId, status, priority, search } = query;
    const skip = (page - 1) * limit;

    const where = {
      organizationId: orgId,
      ...(projectId ? { projectId } : {}),
      ...(assigneeId ? { assigneeId } : {}),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' as const } },
              { description: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ [sortBy || 'createdAt']: sortOrder }, { id: 'asc' }],
        include: {
          project: { select: { id: true, name: true, status: true } },
          assignee: {
            select: {
              id: true,
              userId: true,
              user: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
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

    const data = items.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate,
      organizationId: t.organizationId,
      projectId: t.projectId,
      project: t.project,
      assigneeId: t.assigneeId,
      assignee: t.assignee,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    return { data, meta };
  },

  async getTask(orgId: string, taskId: string) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, organizationId: orgId },
      include: {
        project: { select: { id: true, name: true, status: true } },
        assignee: {
          select: {
            id: true,
            userId: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate,
      organizationId: task.organizationId,
      projectId: task.projectId,
      project: task.project,
      assigneeId: task.assigneeId,
      assignee: task.assignee,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  },

  async createTask(
    orgId: string,
    input: CreateTaskInput,
    actorUserId?: string,
    ipAddress?: string,
    requestId?: string
  ) {
    // 1. Verify project exists in this tenant
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, organizationId: orgId },
    });
    if (!project) {
      throw new NotFoundError('Project not found in this organization');
    }

    // 2. Verify assignee if provided
    if (input.assigneeId) {
      const member = await prisma.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: input.assigneeId,
            organizationId: orgId,
          },
        },
      });
      if (!member || !member.isActive) {
        throw new NotFoundError('Assignee must be an active member of this organization');
      }
    }

    // 3. Create task
    const task = await prisma.task.create({
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority || 'MEDIUM',
        status: input.status || 'TODO',
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        organizationId: orgId,
        projectId: input.projectId,
        assigneeId: input.assigneeId || null,
      },
      include: {
        project: { select: { id: true, name: true } },
        assignee: {
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
      action: 'TASK_CREATE',
      resourceType: 'Task',
      resourceId: task.id,
      ipAddress,
      requestId,
      metadata: {
        title: task.title,
        priority: task.priority,
        status: task.status,
        projectId: task.projectId,
        assigneeId: task.assigneeId,
      },
    });

    return task;
  },

  async updateTask(
    orgId: string,
    taskId: string,
    input: UpdateTaskInput,
    callerPermissions: string[],
    callerUserId: string,
    ipAddress?: string,
    requestId?: string
  ) {
    const hasTaskManage = callerPermissions.includes(PermissionAction.TASK_MANAGE);
    const hasUpdateAssigned = callerPermissions.includes(PermissionAction.TASK_UPDATE_ASSIGNED);

    if (!hasTaskManage && !hasUpdateAssigned) {
      throw new AuthorizationError('Insufficient permissions to update tasks');
    }

    // Scenario A: Full Manager / Admin update (has task:manage)
    if (hasTaskManage) {
      const existing = await prisma.task.findFirst({
        where: { id: taskId, organizationId: orgId },
      });
      if (!existing) {
        throw new NotFoundError('Task not found');
      }

      if (input.projectId) {
        const project = await prisma.project.findFirst({
          where: { id: input.projectId, organizationId: orgId },
        });
        if (!project) {
          throw new NotFoundError('Project not found in this organization');
        }
      }

      if (input.assigneeId) {
        const member = await prisma.organizationMembership.findUnique({
          where: {
            userId_organizationId: {
              userId: input.assigneeId,
              organizationId: orgId,
            },
          },
        });
        if (!member || !member.isActive) {
          throw new NotFoundError('Assignee must be an active member of this organization');
        }
      }

      const updated = await prisma.task.update({
        where: { id: taskId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.dueDate !== undefined
            ? { dueDate: input.dueDate ? new Date(input.dueDate) : null }
            : {}),
          ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
          ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        },
        include: {
          project: { select: { id: true, name: true } },
          assignee: {
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
        actorId: callerUserId,
        action: 'TASK_UPDATE',
        resourceType: 'Task',
        resourceId: taskId,
        ipAddress,
        requestId,
        metadata: { updatedFields: Object.keys(input) },
      });

      return updated;
    }

    // Scenario B: Employee update restriction (only task:update_assigned)
    // 1. Prohibit updates to fields outside status and description
    const forbiddenFields = ['title', 'priority', 'dueDate', 'projectId', 'assigneeId'];
    const attemptedForbidden = forbiddenFields.filter((f) => (input as Record<string, unknown>)[f] !== undefined);
    if (attemptedForbidden.length > 0) {
      throw new AuthorizationError(
        `Employees can only update status and description of their assigned tasks. Disallowed fields: ${attemptedForbidden.join(', ')}`,
        ErrorCode.FORBIDDEN_FIELD_UPDATE
      );
    }

    // 2. ATOMIC update conditioned on assigneeId === callerUserId
    // Prevents TOCTOU race if manager reassigns task concurrently
    const updateResult = await prisma.task.updateMany({
      where: {
        id: taskId,
        organizationId: orgId,
        assigneeId: callerUserId, // Atomic condition!
      },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });

    if (updateResult.count === 0) {
      // Differentiate between 404 Not Found and 403 Forbidden
      const taskExists = await prisma.task.findFirst({
        where: { id: taskId, organizationId: orgId },
      });

      if (!taskExists) {
        throw new NotFoundError('Task not found');
      }

      throw new AuthorizationError(
        'Task is not assigned to you or was concurrently reassigned',
        ErrorCode.FORBIDDEN_NOT_ASSIGNED_TASK
      );
    }

    // 3. Retrieve updated task
    const updated = await prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      include: {
        project: { select: { id: true, name: true } },
        assignee: {
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
      actorId: callerUserId,
      action: 'TASK_UPDATE',
      resourceType: 'Task',
      resourceId: taskId,
      ipAddress,
      requestId,
      metadata: {
        selfUpdate: true,
        updatedFields: Object.keys(input),
        newStatus: input.status,
      },
    });

    return updated;
  },

  async deleteTask(
    orgId: string,
    taskId: string,
    actorUserId?: string,
    ipAddress?: string,
    requestId?: string
  ) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, organizationId: orgId },
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    await prisma.task.delete({
      where: { id: taskId },
    });

    await recordAuditLog({
      organizationId: orgId,
      actorId: actorUserId,
      action: 'TASK_DELETE',
      resourceType: 'Task',
      resourceId: taskId,
      ipAddress,
      requestId,
      metadata: { title: task.title },
    });

    return { success: true, id: taskId };
  },
};
