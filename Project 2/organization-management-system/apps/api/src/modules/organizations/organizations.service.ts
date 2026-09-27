import { prisma } from '../../config/prisma.js';
import { recordAuditLog } from '../audit/audit.service.js';
import { NotFoundError, ConflictError } from '../../utils/errors.js';
import { UpdateOrganizationInput, ErrorCode } from '@orgsphere/shared';

export interface OrganizationWithStats {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  memberCount: number;
  departmentCount: number;
  projectCount: number;
}

export const organizationsService = {
  async getOrganization(orgId: string): Promise<OrganizationWithStats> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        _count: {
          select: {
            memberships: { where: { isActive: true } },
            departments: true,
            projects: true,
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundError('Organization not found');
    }

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      isActive: org.isActive,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
      memberCount: org._count.memberships,
      departmentCount: org._count.departments,
      projectCount: org._count.projects,
    };
  },

  async updateOrganization(
    orgId: string,
    input: UpdateOrganizationInput,
    actorId?: string,
    ipAddress?: string,
    requestId?: string
  ) {
    // 1. Advisory slug check across the entire database (slug has global unique index)
    if (input.slug) {
      const existing = await prisma.organization.findFirst({
        where: {
          slug: input.slug,
          NOT: { id: orgId },
        },
      });
      if (existing) {
        throw new ConflictError('Organization slug is already in use', ErrorCode.SLUG_ALREADY_EXISTS);
      }
    }

    // 2. Perform update
    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.slug ? { slug: input.slug } : {}),
      },
    });

    // 3. Record append-only audit log
    await recordAuditLog({
      organizationId: orgId,
      actorId,
      action: 'ORG_UPDATE',
      resourceType: 'Organization',
      resourceId: orgId,
      ipAddress,
      requestId,
      metadata: {
        nameUpdated: input.name !== undefined,
        slugUpdated: input.slug !== undefined,
        newSlug: input.slug,
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  },
};
