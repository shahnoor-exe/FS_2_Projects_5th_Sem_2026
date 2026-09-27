import { prisma } from '../../config/prisma.js';
import { recordAuditLog } from '../audit/audit.service.js';
import { NotFoundError, ConflictError } from '../../utils/errors.js';
import {
  CreateDepartmentInput,
  UpdateDepartmentInput,
  DepartmentQuery,
  PaginationMeta,
  ErrorCode,
} from '@orgsphere/shared';

export const departmentsService = {
  async listDepartments(orgId: string, query: DepartmentQuery) {
    const { page, limit, sortBy, sortOrder, search } = query;
    const skip = (page - 1) * limit;

    const where = {
      organizationId: orgId,
      ...(search
        ? {
            name: {
              contains: search,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.department.count({ where }),
      prisma.department.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ [sortBy || 'createdAt']: sortOrder }, { id: 'asc' }],
        include: {
          _count: {
            select: { projects: true },
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

    const data = items.map((dept) => ({
      id: dept.id,
      name: dept.name,
      organizationId: dept.organizationId,
      projectCount: dept._count.projects,
      createdAt: dept.createdAt,
      updatedAt: dept.updatedAt,
    }));

    return { data, meta };
  },

  async getDepartment(orgId: string, departmentId: string) {
    const dept = await prisma.department.findFirst({
      where: {
        id: departmentId,
        organizationId: orgId,
      },
      include: {
        _count: {
          select: { projects: true },
        },
      },
    });

    if (!dept) {
      throw new NotFoundError('Department not found');
    }

    return {
      id: dept.id,
      name: dept.name,
      organizationId: dept.organizationId,
      projectCount: dept._count.projects,
      createdAt: dept.createdAt,
      updatedAt: dept.updatedAt,
    };
  },

  async createDepartment(
    orgId: string,
    input: CreateDepartmentInput,
    actorId?: string,
    ipAddress?: string,
    requestId?: string
  ) {
    // 1. Advisory unique name check within the organization
    const existing = await prisma.department.findFirst({
      where: {
        organizationId: orgId,
        name: { equals: input.name, mode: 'insensitive' },
      },
    });

    if (existing) {
      throw new ConflictError(
        'A department with this name already exists in this organization',
        ErrorCode.DEPARTMENT_NAME_EXISTS
      );
    }

    // 2. Insert department
    const department = await prisma.department.create({
      data: {
        name: input.name,
        organizationId: orgId,
      },
    });

    // 3. Record append-only audit log
    await recordAuditLog({
      organizationId: orgId,
      actorId,
      action: 'DEPT_CREATE',
      resourceType: 'Department',
      resourceId: department.id,
      ipAddress,
      requestId,
      metadata: { name: department.name },
    });

    return {
      id: department.id,
      name: department.name,
      organizationId: department.organizationId,
      createdAt: department.createdAt,
      updatedAt: department.updatedAt,
    };
  },

  async updateDepartment(
    orgId: string,
    departmentId: string,
    input: UpdateDepartmentInput,
    actorId?: string,
    ipAddress?: string,
    requestId?: string
  ) {
    const dept = await prisma.department.findFirst({
      where: { id: departmentId, organizationId: orgId },
    });

    if (!dept) {
      throw new NotFoundError('Department not found');
    }

    // Advisory check for duplicate name
    if (input.name && input.name.toLowerCase() !== dept.name.toLowerCase()) {
      const duplicate = await prisma.department.findFirst({
        where: {
          organizationId: orgId,
          name: { equals: input.name, mode: 'insensitive' },
          NOT: { id: departmentId },
        },
      });

      if (duplicate) {
        throw new ConflictError(
          'A department with this name already exists in this organization',
          ErrorCode.DEPARTMENT_NAME_EXISTS
        );
      }
    }

    const updated = await prisma.department.update({
      where: { id: departmentId },
      data: { name: input.name },
    });

    await recordAuditLog({
      organizationId: orgId,
      actorId,
      action: 'DEPT_UPDATE',
      resourceType: 'Department',
      resourceId: updated.id,
      ipAddress,
      requestId,
      metadata: { previousName: dept.name, newName: updated.name },
    });

    return {
      id: updated.id,
      name: updated.name,
      organizationId: updated.organizationId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  },

  async deleteDepartment(
    orgId: string,
    departmentId: string,
    actorId?: string,
    ipAddress?: string,
    requestId?: string
  ) {
    return prisma.$transaction(async (tx) => {
      // 1. Lock the department row to serialize deletion against concurrent modifications
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM departments WHERE id = ${departmentId} AND organization_id = ${orgId} FOR UPDATE
      `;

      if (locked.length === 0) {
        throw new NotFoundError('Department not found');
      }

      // 2. Check referencing projects
      const projectCount = await tx.project.count({
        where: { departmentId, organizationId: orgId },
      });

      if (projectCount > 0) {
        throw new ConflictError(
          `Cannot delete department referenced by ${projectCount} project(s). Reassign or remove projects first.`,
          ErrorCode.DEPARTMENT_HAS_PROJECTS,
          { projectCount }
        );
      }

      // 3. Delete department
      await tx.department.delete({
        where: { id: departmentId },
      });

      // 4. Record append-only audit log within transaction
      await recordAuditLog({
        organizationId: orgId,
        actorId,
        action: 'DEPT_DELETE',
        resourceType: 'Department',
        resourceId: departmentId,
        ipAddress,
        requestId,
        metadata: { referencingProjectsCount: 0 },
        tx,
      });

      return { success: true, id: departmentId };
    });
  },
};
