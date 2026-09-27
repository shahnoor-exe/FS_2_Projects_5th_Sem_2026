import { prisma } from '../../config/prisma.js';
import { Prisma } from '@prisma/client';
import { logger } from '../../config/logger.js';

export interface RecordAuditParams {
  organizationId?: string | null;
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  ipAddress?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
  tx?: Prisma.TransactionClient;
}

// Sensitive keys that must NEVER be written to audit logs
const REDACTED_AUDIT_KEYS = new Set([
  'password',
  'token',
  'refreshtoken',
  'tokenhash',
  'accesstoken',
  'secret',
  'key',
]);

function sanitizeMetadata(metadata?: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!metadata) return null;

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (REDACTED_AUDIT_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Record an audit log entry.
 * If tx is provided, logs within that database transaction.
 * Supports organizationId = null for platform / pre-auth events.
 */
export async function recordAuditLog(params: RecordAuditParams): Promise<void> {
  const db = params.tx || prisma;

  try {
    await db.auditLog.create({
      data: {
        organizationId: params.organizationId ?? null,
        actorId: params.actorId ?? null,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId ?? null,
        ipAddress: params.ipAddress ?? null,
        requestId: params.requestId ?? null,
        metadata: (sanitizeMetadata(params.metadata) as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  } catch (error) {
    logger.error({ error, action: params.action }, 'Failed to record audit log entry');
    // If inside a transaction, rethrow to enforce fail-closed security for critical operations
    if (params.tx) {
      throw new Error(`Audit log write failed for ${params.action}: ${(error as Error).message}`);
    }
  }
}
