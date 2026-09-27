import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { apiClient } from '../../api/client.js';
import { DashboardMetrics } from '../../types/index.js';
import { MetricCard } from './MetricCard.js';
import { Button } from '../common/Button.js';
import {
  MembersIcon,
  DepartmentIcon,
  ProjectsIcon,
  TasksIcon,
  RefreshIcon,
  PlusIcon,
} from '../common/Icons.js';
import { NavigationTab } from '../layout/Sidebar.js';

interface DashboardViewProps {
  onNavigate: (tab: NavigationTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { currentOrganization, tenantGeneration, refreshProfile } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiClient.get<DashboardMetrics>('/organizations/current/dashboard');
      setMetrics(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard metrics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRefresh = async () => {
    await Promise.all([fetchMetrics(), refreshProfile()]);
  };

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics, tenantGeneration]);

  const role = currentOrganization?.role;
  const canManage = role === 'ORG_ADMIN' || role === 'MANAGER';

  return (
    <div id="dashboard-view">
      <div className="page-header">
        <div>
          <h1 className="page-title" id="dashboard-org-title">
            {currentOrganization?.name || 'Workspace'}
          </h1>
          <p className="page-subtitle">
            Tenant slug: <span style={{ color: 'var(--primary)' }}>{currentOrganization?.slug}</span> • Your role: <strong>{role}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button
            id="refresh-dashboard-btn"
            data-testid="refresh-dashboard-btn"
            variant="secondary"
            size="sm"
            icon={<RefreshIcon size={14} />}
            onClick={handleRefresh}
            isLoading={isLoading}
          >
            Refresh
          </Button>

          {canManage && (
            <Button
              id="quick-new-project-btn"
              data-testid="quick-new-project-btn"
              variant="primary"
              size="sm"
              icon={<PlusIcon size={14} />}
              onClick={() => onNavigate('projects')}
            >
              New Project
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="toast toast-error" style={{ marginBottom: '1.5rem', width: '100%' }}>
          <span>{error}</span>
        </div>
      )}

      {isLoading && !metrics ? (
        <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading organization metrics...
        </div>
      ) : metrics ? (
        <>
          <div className="cards-grid">
            <MetricCard
              id="metric-members-card"
              data-testid="metric-members-card"
              title="Team Members"
              value={metrics.members.total}
              subtext={`${metrics.members.byRole.orgAdmin} Admins • ${metrics.members.byRole.manager} Managers • ${metrics.members.byRole.employee} Employees`}
              icon={<MembersIcon size={20} />}
              accentColor="#6366f1"
            />

            <MetricCard
              id="metric-departments-card"
              data-testid="metric-departments-card"
              title="Departments"
              value={metrics.departments.total}
              subtext="Organizational functional units"
              icon={<DepartmentIcon size={20} />}
              accentColor="#06b6d4"
            />

            <MetricCard
              id="metric-projects-card"
              data-testid="metric-projects-card"
              title="Active Projects"
              value={metrics.projects.total}
              subtext={`${metrics.projects.byStatus.inProgress} in progress • ${metrics.projects.byStatus.completed} completed`}
              icon={<ProjectsIcon size={20} />}
              accentColor="#10b981"
            />

            <MetricCard
              id="metric-tasks-card"
              data-testid="metric-tasks-card"
              title="Tasks Overview"
              value={metrics.tasks.total}
              subtext={`${metrics.tasks.byStatus.done} completed • ${metrics.tasks.overdueCount} overdue`}
              icon={<TasksIcon size={20} />}
              accentColor={metrics.tasks.overdueCount > 0 ? '#f43f5e' : '#f59e0b'}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            <div className="glass-card">
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#fff' }}>
                Project Pipeline
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Planning</span>
                  <span style={{ fontWeight: 600 }}>{metrics.projects.byStatus.planning}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>In Progress</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent-emerald)' }}>
                    {metrics.projects.byStatus.inProgress}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>On Hold</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent-amber)' }}>
                    {metrics.projects.byStatus.onHold}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Completed</span>
                  <span style={{ fontWeight: 600 }}>{metrics.projects.byStatus.completed}</span>
                </div>
              </div>
            </div>

            <div className="glass-card">
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: '#fff' }}>
                Task Workflows
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>To Do</span>
                  <span style={{ fontWeight: 600 }}>{metrics.tasks.byStatus.todo}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>In Progress</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>
                    {metrics.tasks.byStatus.inProgress}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>In Review</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent-purple)' }}>
                    {metrics.tasks.byStatus.inReview}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Completed</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent-emerald)' }}>
                    {metrics.tasks.byStatus.done}
                  </span>
                </div>
                {metrics.tasks.overdueCount > 0 && (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--accent-rose-bg)',
                      color: 'var(--accent-rose)',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    ⚠️ {metrics.tasks.overdueCount} task(s) past due date!
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
