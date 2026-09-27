import React, { useState } from 'react';
import { useAuth } from './context/AuthContext.js';
import { Layout } from './components/layout/Layout.js';
import { NavigationTab } from './components/layout/Sidebar.js';
import { LoginForm } from './components/auth/LoginForm.js';
import { RegisterForm } from './components/auth/RegisterForm.js';
import { DashboardView } from './components/dashboard/DashboardView.js';
import { DepartmentsView } from './components/departments/DepartmentsView.js';
import { MembersView } from './components/members/MembersView.js';
import { ProjectsView } from './components/projects/ProjectsView.js';
import { TasksView } from './components/tasks/TasksView.js';
import { AuditLogsView } from './components/audit/AuditLogsView.js';
import { OrganizationSettingsView } from './components/settings/OrganizationSettingsView.js';

export const App: React.FC = () => {
  const { user, currentOrganization, isLoading } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');

  if (isLoading) {
    return (
      <div
        id="loading-spinner-screen"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          background: 'var(--bg-primary)',
        }}
      >
        <div className="brand-logo" style={{ width: '48px', height: '48px', fontSize: '1.5rem' }}>
          OS
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Initializing OrgSphere secure session...
        </p>
      </div>
    );
  }

  if (!user || !currentOrganization) {
    if (authMode === 'register') {
      return <RegisterForm onSwitchToLogin={() => setAuthMode('login')} />;
    }
    return <LoginForm onSwitchToRegister={() => setAuthMode('register')} />;
  }

  const role = currentOrganization.role;
  const isOrgAdmin = role === 'ORG_ADMIN';

  // Fallback to dashboard if a non-admin tries to access admin-only tabs
  let activeView = currentTab;
  if (!isOrgAdmin && (activeView === 'audit' || activeView === 'settings')) {
    activeView = 'dashboard';
  }

  return (
    <Layout currentTab={activeView} onTabChange={setCurrentTab}>
      {activeView === 'dashboard' && <DashboardView onNavigate={setCurrentTab} />}
      {activeView === 'departments' && <DepartmentsView />}
      {activeView === 'members' && <MembersView />}
      {activeView === 'projects' && <ProjectsView />}
      {activeView === 'tasks' && <TasksView />}
      {activeView === 'audit' && isOrgAdmin && <AuditLogsView />}
      {activeView === 'settings' && isOrgAdmin && <OrganizationSettingsView />}
    </Layout>
  );
};
