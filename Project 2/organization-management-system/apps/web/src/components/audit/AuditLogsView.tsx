import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { apiClient } from '../../api/client.js';
import { AuditLog } from '../../types/index.js';
import { Badge } from '../common/Badge.js';
import { AuditIcon, RefreshIcon } from '../common/Icons.js';
import { Button } from '../common/Button.js';

export const AuditLogsView: React.FC = () => {
  const { currentOrganization, tenantGeneration } = useAuth();
  const { error: toastError } = useToast();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiClient.get<AuditLog[]>('/audit-logs');
      setLogs(res.data);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to fetch audit logs');
    } finally {
      setIsLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, tenantGeneration]);

  const toggleExpand = (id: string) => {
    setExpandedLogId((prev) => (prev === id ? null : id));
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes('AUTH')) return 'indigo';
    if (action.includes('CREATE') || action.includes('ADD')) return 'emerald';
    if (action.includes('UPDATE') || action.includes('SWITCH')) return 'amber';
    if (action.includes('DELETE') || action.includes('REVOKE')) return 'rose';
    return 'cyan';
  };

  return (
    <div id="audit-logs-view">
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Trail</h1>
          <p className="page-subtitle">Security and activity audit trail for tenant: {currentOrganization?.name}</p>
        </div>

        <Button
          id="refresh-audit-btn"
          data-testid="refresh-audit-btn"
          variant="secondary"
          size="sm"
          icon={<RefreshIcon size={14} />}
          onClick={fetchLogs}
          isLoading={isLoading}
        >
          Refresh
        </Button>
      </div>

      {isLoading && logs.length === 0 ? (
        <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading security audit logs...
        </div>
      ) : logs.length === 0 ? (
        <div className="glass-card empty-state">
          <AuditIcon size={40} />
          <h3>No audit logs yet</h3>
          <p>Security and entity operations in this tenant are logged here in real-time.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table" id="audit-table" data-testid="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Resource</th>
                <th>IP Address</th>
                <th style={{ textAlign: 'right' }}>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <React.Fragment key={log.id}>
                  <tr
                    data-testid={`audit-row-${log.id}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleExpand(log.id)}
                  >
                    <td>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </td>
                    <td>
                      <Badge color={getActionBadgeColor(log.action)}>
                        {log.action}
                      </Badge>
                    </td>
                    <td>
                      {log.actor ? (
                        <span style={{ fontSize: '0.85rem' }}>
                          {log.actor.firstName} {log.actor.lastName}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>System</span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {log.resourceType} ({log.resourceId ? log.resourceId.substring(0, 8) : 'N/A'}...)
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {log.ipAddress || 'Internal'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--primary)', textDecoration: 'underline' }}>
                        {expandedLogId === log.id ? 'Hide' : 'Details'}
                      </span>
                    </td>
                  </tr>

                  {expandedLogId === log.id && (
                    <tr>
                      <td colSpan={6} style={{ background: 'rgba(15, 20, 34, 0.9)', padding: '1rem 1.5rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                          Request ID: <code>{log.requestId || 'N/A'}</code> • Full Resource ID: <code>{log.resourceId}</code>
                        </div>
                        <pre
                          style={{
                            background: 'var(--bg-primary)',
                            padding: '0.75rem',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '0.75rem',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-primary)',
                            overflowX: 'auto',
                          }}
                        >
                          {JSON.stringify(log.metadata || {}, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
