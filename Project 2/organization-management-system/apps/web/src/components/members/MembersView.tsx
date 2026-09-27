import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { apiClient, ApiError } from '../../api/client.js';
import { Membership } from '../../types/index.js';
import { Button } from '../common/Button.js';
import { Input } from '../common/Input.js';
import { Select } from '../common/Select.js';
import { Badge } from '../common/Badge.js';
import { Modal } from '../common/Modal.js';
import {
  MembersIcon,
  PlusIcon,
  EditIcon,
} from '../common/Icons.js';
import { SystemRoleType } from '@orgsphere/shared';

export const MembersView: React.FC = () => {
  const { currentOrganization, tenantGeneration } = useAuth();
  const { success, error: toastError } = useToast();

  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal State for Adding Member
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<SystemRoleType>('EMPLOYEE');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Edit Role Modal State
  const [editingMember, setEditingMember] = useState<Membership | null>(null);
  const [newRole, setNewRole] = useState<SystemRoleType>('EMPLOYEE');

  const role = currentOrganization?.role;
  const isOrgAdmin = role === 'ORG_ADMIN';

  const fetchMembers = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiClient.get<Membership[]>('/memberships');
      setMemberships(res.data);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to fetch members');
    } finally {
      setIsLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers, tenantGeneration]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberEmail.trim()) {
      setModalError('Email is required');
      return;
    }

    try {
      setModalLoading(true);
      setModalError(null);

      await apiClient.post('/memberships', {
        email: memberEmail.trim().toLowerCase(),
        role: memberRole,
      });

      success('Member added to organization');
      setIsAddModalOpen(false);
      setMemberEmail('');
      setMemberRole('EMPLOYEE');
      fetchMembers();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to add member';
      setModalError(msg);
      toastError(msg);
    } finally {
      setModalLoading(false);
    }
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    try {
      setModalLoading(true);
      await apiClient.patch(`/memberships/${editingMember.id}/role`, { role: newRole });
      success('Member role updated successfully');
      setEditingMember(null);
      fetchMembers();
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to update member role');
    } finally {
      setModalLoading(false);
    }
  };

  const handleToggleStatus = async (membership: Membership) => {
    const action = membership.isActive ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} ${membership.user.email}?`)) {
      return;
    }

    try {
      await apiClient.patch(`/memberships/${membership.id}/status`, {
        isActive: !membership.isActive,
      });
      success(`Member ${action}d successfully`);
      fetchMembers();
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : `Failed to ${action} member`);
    }
  };

  const getRoleBadgeColor = (roleName: string) => {
    switch (roleName) {
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
    <div id="members-view">
      <div className="page-header">
        <div>
          <h1 className="page-title">Team Members</h1>
          <p className="page-subtitle">Manage memberships, roles, and access controls</p>
        </div>

        {isOrgAdmin && (
          <Button
            id="add-member-btn"
            data-testid="add-member-btn"
            variant="primary"
            icon={<PlusIcon size={16} />}
            onClick={() => {
              setMemberEmail('');
              setMemberRole('EMPLOYEE');
              setModalError(null);
              setIsAddModalOpen(true);
            }}
          >
            Add existing user
          </Button>
        )}
      </div>

      {isLoading && memberships.length === 0 ? (
        <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading members...
        </div>
      ) : memberships.length === 0 ? (
        <div className="glass-card empty-state">
          <MembersIcon size={40} />
          <h3>No team members found</h3>
          <p>Add existing registered users to your organization workspace.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table" id="members-table" data-testid="members-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                {isOrgAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {memberships.map((m) => (
                <tr key={m.id} data-testid={`member-row-${m.id}`}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div className="user-avatar" style={{ width: '32px', height: '32px', fontSize: '0.8rem' }}>
                        {m.user.firstName[0]}
                        {m.user.lastName[0]}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {m.user.firstName} {m.user.lastName}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{m.user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge
                      id={`member-role-badge-${m.id}`}
                      data-testid={`member-role-badge-${m.id}`}
                      color={getRoleBadgeColor(m.role.name)}
                    >
                      {m.role.name}
                    </Badge>
                  </td>
                  <td>
                    <Badge color={m.isActive ? 'emerald' : 'rose'}>
                      {m.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {new Date(m.createdAt).toLocaleDateString()}
                    </span>
                  </td>
                  {isOrgAdmin && (
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                        <Button
                          id={`change-role-btn-${m.id}`}
                          data-testid={`change-role-btn-${m.id}`}
                          variant="secondary"
                          size="sm"
                          icon={<EditIcon size={14} />}
                          onClick={() => {
                            setEditingMember(m);
                            setNewRole(m.role.name as SystemRoleType);
                          }}
                          title="Change Role"
                        >
                          Role
                        </Button>
                        <Button
                          id={`toggle-status-btn-${m.id}`}
                          data-testid={`toggle-status-btn-${m.id}`}
                          variant={m.isActive ? 'danger' : 'secondary'}
                          size="sm"
                          onClick={() => handleToggleStatus(m)}
                        >
                          {m.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Member Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add existing user"
      >
        <form onSubmit={handleAddMember} id="add-member-form">
          {modalError && (
            <div className="toast toast-error" style={{ marginBottom: '1rem', width: '100%' }}>
              <span>{modalError}</span>
            </div>
          )}

          <Input
            id="add-member-email-input"
            data-testid="add-member-email-input"
            type="email"
            label="User Email"
            placeholder="user@example.com"
            value={memberEmail}
            onChange={(e) => setMemberEmail(e.target.value)}
            helperText="The user must already have an OrgSphere account"
            required
            autoFocus
          />

          <Select
            id="add-member-role-select"
            data-testid="add-member-role-select"
            label="Initial Role"
            value={memberRole}
            onChange={(e) => setMemberRole(e.target.value as SystemRoleType)}
            options={[
              { value: 'ORG_ADMIN', label: 'Organization Admin' },
              { value: 'MANAGER', label: 'Manager' },
              { value: 'EMPLOYEE', label: 'Employee' },
              { value: 'VIEWER', label: 'Viewer' },
            ]}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsAddModalOpen(false)}
              disabled={modalLoading}
            >
              Cancel
            </Button>
            <Button
              id="confirm-add-member-btn"
              data-testid="confirm-add-member-btn"
              type="submit"
              variant="primary"
              isLoading={modalLoading}
            >
              Add existing user
            </Button>
          </div>
        </form>
      </Modal>

      {/* Change Role Modal */}
      <Modal
        isOpen={Boolean(editingMember)}
        onClose={() => setEditingMember(null)}
        title={`Change Role: ${editingMember?.user.firstName} ${editingMember?.user.lastName}`}
      >
        <form onSubmit={handleUpdateRole} id="change-role-form">
          <Select
            id="change-role-select"
            data-testid="change-role-select"
            label="Select Role"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as SystemRoleType)}
            options={[
              { value: 'ORG_ADMIN', label: 'Organization Admin' },
              { value: 'MANAGER', label: 'Manager' },
              { value: 'EMPLOYEE', label: 'Employee' },
              { value: 'VIEWER', label: 'Viewer' },
            ]}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditingMember(null)}
              disabled={modalLoading}
            >
              Cancel
            </Button>
            <Button
              id="confirm-change-role-btn"
              data-testid="confirm-change-role-btn"
              type="submit"
              variant="primary"
              isLoading={modalLoading}
            >
              Update Role
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
