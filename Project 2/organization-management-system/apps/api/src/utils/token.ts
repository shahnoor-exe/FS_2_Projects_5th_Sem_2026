import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { AuthenticationError } from './errors.js';

export interface AccessTokenPayload {
  userId: string;
  email: string;
  organizationId: string;
  roleId: string;
  platformRole: string;
}

interface DecodedToken extends AccessTokenPayload, jwt.JwtPayload {
  typ?: string;
}

const JWT_ISSUER = 'orgsphere-api';
const JWT_AUDIENCE = 'orgsphere-client';
const JWT_ALGORITHM = 'HS256';

/**
 * Generate a tenant-bound access token.
 */
export function generateAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(
    {
      userId: payload.userId,
      email: payload.email,
      organizationId: payload.organizationId,
      roleId: payload.roleId,
      platformRole: payload.platformRole,
      typ: 'access',
    },
    env.JWT_ACCESS_SECRET,
    {
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    }
  );
}

/**
 * Verify a tenant-bound access token enforcing HS256, issuer, audience, and type.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as DecodedToken;

    if (decoded.typ !== 'access') {
      throw new AuthenticationError('Invalid token type');
    }

    if (!decoded.userId || !decoded.organizationId) {
      throw new AuthenticationError('Malformed token payload');
    }

    return {
      userId: decoded.userId,
      email: decoded.email,
      organizationId: decoded.organizationId,
      roleId: decoded.roleId,
      platformRole: decoded.platformRole || 'USER',
    };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    throw new AuthenticationError('Invalid or expired access token');
  }
}

/**
 * Generate a cryptographically secure random refresh token (32 bytes hex)
 * and its SHA-256 hash for database storage.
 */
export function generateRefreshToken(): { cleartextToken: string; tokenHash: string } {
  const cleartextToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashRefreshToken(cleartextToken);
  return { cleartextToken, tokenHash };
}

/**
 * Hash a cleartext refresh token with SHA-256.
 */
export function hashRefreshToken(cleartextToken: string): string {
  return crypto.createHash('sha256').update(cleartextToken).digest('hex');
}
