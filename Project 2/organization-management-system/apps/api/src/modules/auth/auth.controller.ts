import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service.js';
import { sendSuccess } from '../../utils/response.js';
import { env } from '../../config/env.js';
import { registerSchema, loginSchema, switchOrgSchema } from '@orgsphere/shared';
import { ValidationError, AuthenticationError } from '../../utils/errors.js';

export function getCookieName(): string {
  return env.NODE_ENV === 'production' ? '__Secure-orgsphere_refresh' : 'orgsphere_refresh';
}

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/v1/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new ValidationError('Validation failed for registration', parseResult.error.format()));
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const requestId = req.headers['x-request-id'] as string;

    const result = await authService.register(parseResult.data, ipAddress, requestId);

    // Set HTTP-only secure refresh cookie scoped to /api/v1/auth
    res.cookie(getCookieName(), result.refreshToken, getCookieOptions());

    sendSuccess(
      res,
      {
        user: result.user,
        organization: result.organization,
        accessToken: result.accessToken,
      },
      undefined,
      201
    );
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new ValidationError('Validation failed for login', parseResult.error.format()));
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const requestId = req.headers['x-request-id'] as string;

    const result = await authService.login(parseResult.data, ipAddress, requestId);

    res.cookie(getCookieName(), result.refreshToken, getCookieOptions());

    sendSuccess(res, {
      user: result.user,
      organization: result.organization,
      accessToken: result.accessToken,
      accessibleOrganizations: result.accessibleOrganizations,
    });
  } catch (error) {
    next(error);
  }
}

function validateCsrfProtection(req: Request): void {
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  // 1. Validate Origin header if present
  if (origin) {
    if (origin !== env.CORS_ORIGIN) {
      throw new AuthenticationError(`CSRF check failed: untrusted origin '${origin}'`);
    }
  } else if (referer) {
    // 2. Fall back to Referer validation if Origin header was omitted
    let refererOrigin: string;
    try {
      refererOrigin = new URL(referer).origin;
    } catch {
      throw new AuthenticationError('CSRF check failed: malformed referer header');
    }

    if (refererOrigin !== env.CORS_ORIGIN) {
      throw new AuthenticationError(`CSRF check failed: untrusted referer origin '${refererOrigin}'`);
    }
  }

  // 3. Verify presence of trusted custom client header
  const clientHeader = req.headers['x-orgsphere-client'] || req.headers['x-requested-with'];
  if (!clientHeader) {
    throw new AuthenticationError('Missing CSRF verification header for cookie-authenticated request');
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cookieToken = req.cookies?.[getCookieName()];
    const bodyToken = req.body?.refreshToken;
    const token = cookieToken || bodyToken;

    if (!token) {
      return next(new AuthenticationError('Refresh token required in cookie or payload'));
    }

    // CSRF defense-in-depth for cookie-bearing browser requests
    if (cookieToken) {
      validateCsrfProtection(req);
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const requestId = req.headers['x-request-id'] as string;

    const result = await authService.refresh(token, ipAddress, requestId);

    // Set rotated token
    res.cookie(getCookieName(), result.refreshToken, getCookieOptions());

    sendSuccess(res, {
      accessToken: result.accessToken,
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cookieToken = req.cookies?.[getCookieName()];
    const bodyToken = req.body?.refreshToken;
    const token = cookieToken || bodyToken;

    // Enforce CSRF protection for cookie-bearing logout
    if (cookieToken) {
      validateCsrfProtection(req);
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const requestId = req.headers['x-request-id'] as string;

    if (token) {
      await authService.logout(token, ipAddress, requestId);
    }

    // Clear cookie with identical name and path
    res.clearCookie(getCookieName(), {
      path: '/api/v1/auth',
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    sendSuccess(res, { message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
}

export async function switchOrg(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parseResult = switchOrgSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new ValidationError('Invalid organization ID format', parseResult.error.format()));
    }

    const userId = req.user!.userId;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const requestId = req.headers['x-request-id'] as string;

    const result = await authService.switchOrg(userId, parseResult.data.targetOrganizationId, ipAddress, requestId);

    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const currentOrgId = req.user!.organizationId;

    const profile = await authService.getMe(userId, currentOrgId);
    sendSuccess(res, profile);
  } catch (error) {
    next(error);
  }
}
