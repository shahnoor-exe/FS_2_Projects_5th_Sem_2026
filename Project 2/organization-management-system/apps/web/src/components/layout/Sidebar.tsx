import React from 'react';
import { useAuth } from '../../context/AuthContext.js';
import {
  DashboardIcon,
  DepartmentIcon,
  MembersIcon,
  ProjectsIcon,
  TasksIcon,
  AuditIcon,
  SettingsIcon,
} from '../common/Icons.js';

export type NavigationTab =
  | 'dashboard'
  | 'departments'
  | 'members'
  | 'projects'
  | 'tasks'
  | 'audit'
  | 'settings';

interface SidebarProps {
  currentTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onTabChange }) => {
  const { currentOrganization } = useAuth();
  const role = currentOrganization?.role;

  const isOrgAdmin = role === 'ORG_ADMIN';

  const navItems = [
    { id: 'dashboard' as NavigationTab, label: 'Dashboard', icon: <DashboardIcon size={18} /> },
    { id: 'departments' as NavigationTab, label: 'Departments', icon: <DepartmentIcon size={18} /> },
    { id: 'members' as NavigationTab, label: 'Members', icon: <MembersIcon size={18} /> },
    { id: 'projects' as NavigationTab, label: 'Projects', icon: <ProjectsIcon size={18} /> },
    { id: 'tasks' as NavigationTab, label: 'Tasks', icon: <TasksIcon size={18} /> },
  ];

  if (isOrgAdmin) {
    navItems.push({ id: 'audit' as NavigationTab, label: 'Audit Logs', icon: <AuditIcon size={18} /> });
    navItems.push({ id: 'settings' as NavigationTab, label: 'Settings', icon: <SettingsIcon size={18} /> });
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-logo">OS</div>
        <div className="brand-text">OrgSphere</div>
      </div>

      <nav className="sidebar-nav" aria-label="Main Navigation">
        {navItems.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              data-testid={`nav-${item.id}`}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <div>OrgSphere v1.0.0</div>
          <div style={{ marginTop: '0.2rem', color: 'var(--text-secondary)' }}>
            Tenant: <strong>{currentOrganization?.slug || 'default'}</strong>
          </div>
        </div>
      </div>
    </aside>
  );
};
