import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { Badge } from '../common/Badge.js';
import { Button } from '../common/Button.js';
import { LogOutIcon } from '../common/Icons.js';

export const Navbar: React.FC = () => {
  const { user, currentOrganization, accessibleOrganizations, switchOrganization, logout } = useAuth();
  const { error } = useToast();
  const [isSwitching, setIsSwitching] = useState(false);

  const handleOrgChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const targetOrgId = e.target.value;
    if (!targetOrgId || targetOrgId === currentOrganization?.id) return;

    try {
      setIsSwitching(true);
      await switchOrganization(targetOrgId);
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Failed to switch organization');
    } finally {
      setIsSwitching(false);
    }
  };

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'ORG_ADMIN':
        return 'rose';
      case 'MANAGER':
        return 'amber';
      case 'EMPLOYEE':
        return 'indigo';
      case 'VIEWER':
      default:
        return 'cyan';
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="org-switcher-wrapper">
          <label htmlFor="org-switcher-select" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Organization:
          </label>
          <select
            id="org-switcher-select"
            data-testid="org-switcher-select"
            className="org-selector"
            value={currentOrganization?.id || ''}
            onChange={handleOrgChange}
            disabled={isSwitching}
          >
            {accessibleOrganizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} ({org.role})
              </option>
            ))}
          </select>
          {isSwitching && (
            <span style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>Switching...</span>
          )}
        </div>
      </div>

      <div className="topbar-right">
        {user && currentOrganization && (
          <div className="user-badge" id="current-user-badge">
            <div className="user-avatar" title={user.email}>
              {user.firstName[0]}
              {user.lastName[0]}
            </div>
            <div className="user-info">
              <span className="user-name" id="user-display-name">
                {user.firstName} {user.lastName}
              </span>
              <Badge
                id="user-role-badge"
                data-testid="user-role-badge"
                color={getRoleBadgeColor(currentOrganization.role)}
              >
                {currentOrganization.role}
              </Badge>
            </div>
          </div>
        )}

        <Button
          id="logout-button"
          data-testid="logout-button"
          variant="secondary"
          size="sm"
          icon={<LogOutIcon size={15} />}
          onClick={logout}
          title="Sign out of OrgSphere"
        >
          Logout
        </Button>
      </div>
    </header>
  );
};
