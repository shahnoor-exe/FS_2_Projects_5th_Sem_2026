import crypto from 'crypto';
import { prisma } from '../../config/prisma.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { encryptField, decryptField } from '../../utils/crypto.js';
import { generateAccessToken, generateRefreshToken, hashRefreshToken } from '../../utils/token.js';
import { recordAuditLog } from '../audit/audit.service.js';
import {
  AuthenticationError,
  ConflictError,
  AccountDeactivatedError,
  OrganizationDeactivatedError,
  MembershipDeactivatedError,
  ConcurrentRefreshRaceError,
  TenantMismatchError,
} from '../../utils/errors.js';
import { RegisterInput, LoginInput, SystemRole, PermissionAction } from '@orgsphere/shared';
import { ensureSystemRoles } from '../../utils/roles.js';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DUPLICATE_RACE_WINDOW_MS = 5000; // 5-second bounded duplicate window (RFC 9700)

export interface AuthResult {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    platformRole: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  accessToken: string;
  refreshToken: string;
  accessibleOrganizations?: Array<{ id: string; name: string; slug: string; role: string }>;
}

export class AuthService {
  /**
   * Register a new user, default organization, and owner membership.
   * Client-supplied platformRole is strictly ignored/prevented by schema.
   */
  async register(input: RegisterInput, ipAddress?: string, requestId?: string): Promise<AuthResult> {
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existingUser) {
      throw new ConflictError('A user with this email address already exists');
    }

    // Generate unique slug from organization name
    const baseSlug = input.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const slugSuffix = crypto.randomBytes(3).toString('hex');
    const slug = `${baseSlug}-${slugSuffix}`;

    const existingOrg = await prisma.organization.findUnique({ where: { slug } });
    if (existingOrg) {
      throw new ConflictError('Organization with this name/slug already exists');
    }

    const passwordHash = await hashPassword(input.password);

    let phoneEncrypted: { ciphertext: string; iv: string; tag: string } | null = null;
    if (input.phone) {
      phoneEncrypted = encryptField(input.phone);
    }

    const { cleartextToken, tokenHash } = generateRefreshToken();
    const tokenFamilyId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create User (strictly platformRole: 'USER')
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          platformRole: 'USER',
          phoneCiphertext: phoneEncrypted?.ciphertext ?? null,
          phoneIv: phoneEncrypted?.iv ?? null,
          phoneTag: phoneEncrypted?.tag ?? null,
          isActive: true,
        },
      });

      // 2. Create Organization
      const org = await tx.organization.create({
        data: {
          name: input.organizationName,
          slug,
          isActive: true,
        },
      });

      // 3. Ensure all 4 system roles and 12 permissions exist
      const systemRoles = await ensureSystemRoles(tx);
      const adminRole = systemRoles[SystemRole.ORG_ADMIN];

      // 4. Create OrganizationMembership
      await tx.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          roleId: adminRole.id,
          isActive: true,
        },
      });

      // 5. Store initial Refresh Token
      await tx.refreshToken.create({
        data: {
          tokenHash,
          userId: user.id,
          organizationId: org.id,
          familyId: tokenFamilyId,
          expiresAt,
        },
      });

      // 6. Record Audit Log
      await recordAuditLog({
        organizationId: org.id,
        actorId: user.id,
        action: 'AUTH_REGISTER',
        resourceType: 'User',
        resourceId: user.id,
        ipAddress,
        requestId,
        metadata: {
          email: user.email,
          organizationId: org.id,
          organizationSlug: org.slug,
        },
        tx,
      });

      const accessToken = generateAccessToken({
        userId: user.id,
        email: user.email,
        organizationId: org.id,
        roleId: adminRole.id,
        platformRole: user.platformRole,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: input.phone || null,
          platformRole: user.platformRole,
        },
        organization: {
          id: org.id,
          name: org.name,
          slug: org.slug,
        },
        accessToken,
        refreshToken: cleartextToken,
      };
    });

    return result;
  }

  /**
   * Authenticate user with email and password, returning tokens and accessible organizations.
   */
  async login(input: LoginInput, ipAddress?: string, requestId?: string): Promise<AuthResult> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        memberships: {
          where: { isActive: true, organization: { isActive: true } },
          include: {
            organization: true,
            role: true,
          },
        },
      },
    });

    if (!user) {
      await recordAuditLog({
        organizationId: null, // Pre-auth unknown user
        action: 'AUTH_LOGIN_FAILED',
        resourceType: 'Auth',
        ipAddress,
        requestId,
        metadata: { emailAttempted: input.email, reason: 'USER_NOT_FOUND' },
      });
      throw new AuthenticationError('Invalid email or password');
    }

    if (!user.isActive) {
      await recordAuditLog({
        organizationId: null,
        actorId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        resourceType: 'User',
        resourceId: user.id,
        ipAddress,
        requestId,
        metadata: { reason: 'ACCOUNT_DEACTIVATED' },
      });
      throw new AccountDeactivatedError('User account is currently deactivated');
    }

    const isPasswordValid = await verifyPassword(user.passwordHash, input.password);
    if (!isPasswordValid) {
      await recordAuditLog({
        organizationId: null,
        actorId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        resourceType: 'Auth',
        resourceId: user.id,
        ipAddress,
        requestId,
        metadata: { reason: 'INVALID_CREDENTIALS' },
      });
      throw new AuthenticationError('Invalid email or password');
    }

    if (user.memberships.length === 0) {
      throw new AuthenticationError('User does not belong to any active organization');
    }

    // Select target organization
    let activeMembership = user.memberships[0];
    if (input.organizationId) {
      const selected = user.memberships.find((m) => m.organizationId === input.organizationId);
      if (!selected) {
        throw new AuthenticationError('User does not hold an active membership in the specified organization');
      }
      activeMembership = selected;
    }

    const { cleartextToken, tokenHash } = generateRefreshToken();
    const tokenFamilyId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.create({
        data: {
          tokenHash,
          userId: user.id,
          organizationId: activeMembership.organizationId,
          familyId: tokenFamilyId,
          expiresAt,
        },
      });

      await recordAuditLog({
        organizationId: activeMembership.organizationId,
        actorId: user.id,
        action: 'AUTH_LOGIN',
        resourceType: 'User',
        resourceId: user.id,
        ipAddress,
        requestId,
        metadata: { organizationId: activeMembership.organizationId },
        tx,
      });
    });

    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      organizationId: activeMembership.organizationId,
      roleId: activeMembership.roleId,
      platformRole: user.platformRole,
    });

    let decryptedPhone: string | null = null;
    if (user.phoneCiphertext && user.phoneIv && user.phoneTag) {
      try {
        decryptedPhone = decryptField(user.phoneCiphertext, user.phoneIv, user.phoneTag);
      } catch {
        decryptedPhone = null;
      }
    }

    const accessibleOrganizations = user.memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role.name,
    }));

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: decryptedPhone,
        platformRole: user.platformRole,
      },
      organization: {
        id: activeMembership.organization.id,
        name: activeMembership.organization.name,
        slug: activeMembership.organization.slug,
      },
      accessToken,
      refreshToken: cleartextToken,
      accessibleOrganizations,
    };
  }

  /**
   * Rotate a refresh token with atomic claim and 5-second duplicate race protection.
   */
  async refresh(
    cleartextToken: string,
    ipAddress?: string,
    requestId?: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!cleartextToken) {
      throw new AuthenticationError('Refresh token is required');
    }

    const tokenHash = hashRefreshToken(cleartextToken);

    // 1. Attempt atomic conditional claim inside interactive transaction
    const rotateResult = await prisma.$transaction(
      async (tx) => {
        // Lock the token row with SELECT ... FOR UPDATE to serialize concurrent rotation attempts
        const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM refresh_tokens WHERE token_hash = ${tokenHash} FOR UPDATE
        `;

        if (!lockedRows || lockedRows.length === 0) {
          throw new AuthenticationError('Invalid refresh token');
        }

        // Capture decision time immediately AFTER acquiring the exclusive row lock
        const now = new Date();

        // Read the token with relations under the exclusive row lock
        const existingToken = await tx.refreshToken.findUniqueOrThrow({
          where: { id: lockedRows[0].id },
          include: {
            user: true,
            organization: true,
            membership: { include: { role: true } },
          },
        });

      // Check if already revoked
      if (existingToken.revokedAt) {
        const timeSinceRevocation = now.getTime() - existingToken.revokedAt.getTime();

        // Legitimate logout
        if (existingToken.revocationReason === 'LOGOUT') {
          throw new AuthenticationError('Session terminated');
        }

        // Bounded duplicate window check (RFC 9700):
        // If revoked within 5s as ROTATED or ORG_SWITCH, treat as concurrent race duplicate.
        // DO NOT revoke family; winner replacement remains usable!
        if (
          (existingToken.revocationReason === 'ROTATED' || existingToken.revocationReason === 'ORG_SWITCH') &&
          timeSinceRevocation <= DUPLICATE_RACE_WINDOW_MS
        ) {
          throw new ConcurrentRefreshRaceError();
        }

        // Outside duplicate window: Later Replay Attack Detected!
        // Revoke entire token family to protect session and commit revocation
        await tx.refreshToken.updateMany({
          where: { familyId: existingToken.familyId, revokedAt: null },
          data: { revokedAt: now, revocationReason: 'SECURITY_REUSE' },
        });

        await recordAuditLog({
          organizationId: existingToken.organizationId,
          actorId: existingToken.userId,
          action: 'AUTH_TOKEN_REUSE_DETECTED',
          resourceType: 'RefreshToken',
          resourceId: existingToken.id,
          ipAddress,
          requestId,
          metadata: { familyId: existingToken.familyId },
          tx,
        });

        return {
          replayDetected: true,
          accessToken: '',
          refreshToken: '',
        };
      }

      // Check token expiration
      if (existingToken.expiresAt <= now) {
        throw new AuthenticationError('Refresh token expired');
      }

      // Verify immediate active status across user, org, and membership
      if (!existingToken.user.isActive) {
        await tx.refreshToken.update({
          where: { id: existingToken.id },
          data: { revokedAt: now, revocationReason: 'USER_DEACTIVATED' },
        });
        return { userDeactivated: true, accessToken: '', refreshToken: '' };
      }

      if (!existingToken.organization.isActive) {
        await tx.refreshToken.update({
          where: { id: existingToken.id },
          data: { revokedAt: now, revocationReason: 'ORG_DEACTIVATED' },
        });
        return { orgDeactivated: true, accessToken: '', refreshToken: '' };
      }

      if (!existingToken.membership.isActive) {
        await tx.refreshToken.update({
          where: { id: existingToken.id },
          data: { revokedAt: now, revocationReason: 'MEMBERSHIP_DEACTIVATED' },
        });
        return { membershipDeactivated: true, accessToken: '', refreshToken: '' };
      }

      // Winner claims token: mark ROTATED
      await tx.refreshToken.update({
        where: { id: existingToken.id },
        data: {
          revokedAt: now,
          revocationReason: 'ROTATED',
        },
      });

      // Generate replacement token inheriting the same familyId
      const { cleartextToken: newCleartext, tokenHash: newHash } = generateRefreshToken();
      const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);

      const replacement = await tx.refreshToken.create({
        data: {
          tokenHash: newHash,
          userId: existingToken.userId,
          organizationId: existingToken.organizationId,
          familyId: existingToken.familyId,
          expiresAt,
        },
      });

      await tx.refreshToken.update({
        where: { id: existingToken.id },
        data: { replacedByTokenId: replacement.id },
      });

      const newAccessToken = generateAccessToken({
        userId: existingToken.userId,
        email: existingToken.user.email,
        organizationId: existingToken.organizationId,
        roleId: existingToken.membership.roleId,
        platformRole: existingToken.user.platformRole,
      });

      await recordAuditLog({
        organizationId: existingToken.organizationId,
        actorId: existingToken.userId,
        action: 'AUTH_TOKEN_REFRESH',
        resourceType: 'RefreshToken',
        resourceId: replacement.id,
        ipAddress,
        requestId,
        tx,
      });

      return {
        accessToken: newAccessToken,
        refreshToken: newCleartext,
      };
    }, { maxWait: 10000, timeout: 15000 });

    if ('replayDetected' in rotateResult && rotateResult.replayDetected) {
      throw new AuthenticationError('Session invalid due to token replay detection');
    }
    if ('userDeactivated' in rotateResult && rotateResult.userDeactivated) {
      throw new AccountDeactivatedError();
    }
    if ('orgDeactivated' in rotateResult && rotateResult.orgDeactivated) {
      throw new OrganizationDeactivatedError();
    }
    if ('membershipDeactivated' in rotateResult && rotateResult.membershipDeactivated) {
      throw new MembershipDeactivatedError();
    }

    return {
      accessToken: rotateResult.accessToken,
      refreshToken: rotateResult.refreshToken,
    };
  }

  /**
   * Revoke current refresh token on explicit user logout.
   */
  async logout(cleartextToken?: string, ipAddress?: string, requestId?: string): Promise<void> {
    if (!cleartextToken) return;

    const tokenHash = hashRefreshToken(cleartextToken);
    const token = await prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (token && !token.revokedAt) {
      await prisma.refreshToken.update({
        where: { id: token.id },
        data: {
          revokedAt: new Date(),
          revocationReason: 'LOGOUT',
        },
      });

      await recordAuditLog({
        organizationId: token.organizationId,
        actorId: token.userId,
        action: 'AUTH_LOGOUT',
        resourceType: 'RefreshToken',
        resourceId: token.id,
        ipAddress,
        requestId,
      });
    }
  }

  /**
   * Switch tenant context, establishing valid session possession, rotating refresh token,
   * verifying active membership in target organization, and issuing target-scoped credentials.
   *
   * Architectural Limitation:
   * Revoking the presented refresh token prevents further refresh through that token/session family
   * (without preventing Org A token issuance through another independently valid session the user may hold).
   * However, any already-issued Org A access token remains cryptographically valid until its 15-minute expiry,
   * subject to live active-membership checks in PostgreSQL. The browser client is responsible for discarding
   * the old access token upon a successful switch; the server does not claim that stateless access tokens
   * are instantly revoked.
   */
  async switchOrg(
    userId: string,
    currentOrgId: string,
    targetOrganizationId: string,
    cleartextRefreshToken: string,
    ipAddress?: string,
    requestId?: string
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    organization: { id: string; name: string; slug: string };
  }> {
    if (!cleartextRefreshToken) {
      throw new AuthenticationError('Refresh token required to switch organization session');
    }

    const tokenHash = hashRefreshToken(cleartextRefreshToken);

    const switchResult = await prisma.$transaction(
      async (tx) => {
        // 1. Lock the token row with SELECT ... FOR UPDATE to serialize concurrent rotation/switch attempts
        const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM refresh_tokens WHERE token_hash = ${tokenHash} FOR UPDATE
        `;

        if (!lockedRows || lockedRows.length === 0) {
          throw new AuthenticationError('Invalid refresh token');
        }

        // Capture decision time immediately AFTER acquiring the exclusive row lock
        const now = new Date();

        // 2. Read the token with relations under exclusive row lock
        const existingToken = await tx.refreshToken.findUniqueOrThrow({
          where: { id: lockedRows[0].id },
          include: {
            user: true,
            organization: true,
            membership: { include: { role: true } },
          },
        });

      // 3. Verify session binding: token must belong to caller and current organization of the bearer token
      if (existingToken.userId !== userId || existingToken.organizationId !== currentOrgId) {
        throw new AuthenticationError('Refresh token does not match active authenticated session');
      }

      // 4. Check revocation state
      if (existingToken.revokedAt) {
        const timeSinceRevocation = now.getTime() - existingToken.revokedAt.getTime();

        if (existingToken.revocationReason === 'LOGOUT') {
          throw new AuthenticationError('Session terminated');
        }

        // Bounded duplicate window check (RFC 9700):
        // If revoked within 5s as ROTATED or ORG_SWITCH, serialize against race duplicate.
        if (
          (existingToken.revocationReason === 'ROTATED' || existingToken.revocationReason === 'ORG_SWITCH') &&
          timeSinceRevocation <= DUPLICATE_RACE_WINDOW_MS
        ) {
          throw new ConcurrentRefreshRaceError();
        }

        // Outside duplicate window: Later Replay Attack Detected!
        // Revoke entire token family to protect session
        await tx.refreshToken.updateMany({
          where: { familyId: existingToken.familyId, revokedAt: null },
          data: { revokedAt: now, revocationReason: 'SECURITY_REUSE' },
        });

        await recordAuditLog({
          organizationId: existingToken.organizationId,
          actorId: existingToken.userId,
          action: 'AUTH_TOKEN_REUSE_DETECTED',
          resourceType: 'RefreshToken',
          resourceId: existingToken.id,
          ipAddress,
          requestId,
          metadata: { familyId: existingToken.familyId },
          tx,
        });

        return {
          replayDetected: true,
          accessToken: '',
          refreshToken: '',
          organization: { id: '', name: '', slug: '' },
        };
      }

      // 5. Check token expiration
      if (existingToken.expiresAt <= now) {
        throw new AuthenticationError('Refresh token expired');
      }

      // 6. Verify immediate active status across user, current org, and current membership
      if (!existingToken.user.isActive) {
        await tx.refreshToken.update({
          where: { id: existingToken.id },
          data: { revokedAt: now, revocationReason: 'USER_DEACTIVATED' },
        });
        return { userDeactivated: true, accessToken: '', refreshToken: '', organization: { id: '', name: '', slug: '' } };
      }

      if (!existingToken.organization.isActive) {
        await tx.refreshToken.update({
          where: { id: existingToken.id },
          data: { revokedAt: now, revocationReason: 'ORG_DEACTIVATED' },
        });
        return { orgDeactivated: true, accessToken: '', refreshToken: '', organization: { id: '', name: '', slug: '' } };
      }

      if (!existingToken.membership.isActive) {
        await tx.refreshToken.update({
          where: { id: existingToken.id },
          data: { revokedAt: now, revocationReason: 'MEMBERSHIP_DEACTIVATED' },
        });
        return { membershipDeactivated: true, accessToken: '', refreshToken: '', organization: { id: '', name: '', slug: '' } };
      }

      // 7. Verify active membership in the target organization
      const targetMembership = await tx.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId: targetOrganizationId,
          },
        },
        include: {
          user: true,
          organization: true,
          role: true,
        },
      });

      if (!targetMembership) {
        throw new TenantMismatchError('User is not a member of the requested organization');
      }

      if (!targetMembership.user.isActive) throw new AccountDeactivatedError();
      if (!targetMembership.organization.isActive) throw new OrganizationDeactivatedError();
      if (!targetMembership.isActive) throw new MembershipDeactivatedError();

      // 8. Revoke presented token with ORG_SWITCH
      await tx.refreshToken.update({
        where: { id: existingToken.id },
        data: {
          revokedAt: now,
          revocationReason: 'ORG_SWITCH',
        },
      });

      // 9. Create target-tenant replacement refresh token inheriting familyId
      const { cleartextToken: newCleartext, tokenHash: newHash } = generateRefreshToken();
      const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);

      const replacement = await tx.refreshToken.create({
        data: {
          tokenHash: newHash,
          userId,
          organizationId: targetOrganizationId,
          familyId: existingToken.familyId,
          expiresAt,
        },
      });

      await tx.refreshToken.update({
        where: { id: existingToken.id },
        data: { replacedByTokenId: replacement.id },
      });

      // 10. Generate access token scoped to target organization
      const newAccessToken = generateAccessToken({
        userId,
        email: targetMembership.user.email,
        organizationId: targetOrganizationId,
        roleId: targetMembership.roleId,
        platformRole: targetMembership.user.platformRole,
      });

      // 11. Record audit log inside transaction
      await recordAuditLog({
        organizationId: targetOrganizationId,
        actorId: userId,
        action: 'AUTH_ORG_SWITCH',
        resourceType: 'Organization',
        resourceId: targetOrganizationId,
        ipAddress,
        requestId,
        metadata: {
          previousOrganizationId: currentOrgId,
          targetOrganizationId,
          replacementTokenId: replacement.id,
        },
        tx,
      });

      return {
        accessToken: newAccessToken,
        refreshToken: newCleartext,
        organization: {
          id: targetMembership.organization.id,
          name: targetMembership.organization.name,
          slug: targetMembership.organization.slug,
        },
      };
    }, { maxWait: 10000, timeout: 15000 });

    if ('replayDetected' in switchResult && switchResult.replayDetected) {
      throw new AuthenticationError('Session invalid due to token replay detection');
    }
    if ('userDeactivated' in switchResult && switchResult.userDeactivated) {
      throw new AccountDeactivatedError();
    }
    if ('orgDeactivated' in switchResult && switchResult.orgDeactivated) {
      throw new OrganizationDeactivatedError();
    }
    if ('membershipDeactivated' in switchResult && switchResult.membershipDeactivated) {
      throw new MembershipDeactivatedError();
    }

    return {
      accessToken: switchResult.accessToken,
      refreshToken: switchResult.refreshToken,
      organization: switchResult.organization,
    };
  }

  /**
   * Retrieve current authenticated user profile and memberships.
   */
  async getMe(userId: string, currentOrgId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: { isActive: true, organization: { isActive: true } },
          include: { organization: true, role: true },
        },
      },
    });

    let phone: string | null = null;
    if (user.phoneCiphertext && user.phoneIv && user.phoneTag) {
      try {
        phone = decryptField(user.phoneCiphertext, user.phoneIv, user.phoneTag);
      } catch {
        phone = null;
      }
    }

    const currentMembership = user.memberships.find((m) => m.organizationId === currentOrgId);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone,
        platformRole: user.platformRole,
      },
      currentOrganization: currentMembership
        ? {
            id: currentMembership.organization.id,
            name: currentMembership.organization.name,
            slug: currentMembership.organization.slug,
            role: currentMembership.role.name,
          }
        : null,
      accessibleOrganizations: user.memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role.name,
      })),
    };
  }
}

export const authService = new AuthService();
