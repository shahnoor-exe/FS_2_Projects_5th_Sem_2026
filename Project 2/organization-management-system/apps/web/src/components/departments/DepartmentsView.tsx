import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { apiClient, ApiError } from '../../api/client.js';
import { Department } from '../../types/index.js';
import { Button } from '../common/Button.js';
import { Input } from '../common/Input.js';
import { Modal } from '../common/Modal.js';
import {
  DepartmentIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
} from '../common/Icons.js';

export const DepartmentsView: React.FC = () => {
  const { currentOrganization, tenantGeneration } = useAuth();
  const { success, error: toastError } = useToast();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptName, setDeptName] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const role = currentOrganization?.role;
  const canManage = role === 'ORG_ADMIN' || role === 'MANAGER';

  const fetchDepartments = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiClient.get<Department[]>('/departments', {
        search: search.trim() || undefined,
      });
      setDepartments(res.data);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to fetch departments');
    } finally {
      setIsLoading(false);
    }
  }, [search, toastError]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments, tenantGeneration]);

  const handleOpenCreate = () => {
    setEditingDept(null);
    setDeptName('');
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (dept: Department) => {
    setEditingDept(dept);
    setDeptName(dept.name);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName.trim()) {
      setModalError('Department name is required');
      return;
    }

    try {
      setModalLoading(true);
      setModalError(null);

      if (editingDept) {
        await apiClient.patch(`/departments/${editingDept.id}`, { name: deptName.trim() });
        success('Department updated successfully');
      } else {
        await apiClient.post('/departments', { name: deptName.trim() });
        success('Department created successfully');
      }

      setIsModalOpen(false);
      fetchDepartments();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to save department';
      setModalError(msg);
      toastError(msg);
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteDepartment = async (dept: Department) => {
    if (!window.confirm(`Are you sure you want to delete department "${dept.name}"?`)) {
      return;
    }

    try {
      await apiClient.delete(`/departments/${dept.id}`);
      success('Department deleted successfully');
      fetchDepartments();
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to delete department');
    }
  };

  return (
    <div id="departments-view">
      <div className="page-header">
        <div>
          <h1 className="page-title">Departments</h1>
          <p className="page-subtitle">Organize teams, departments, and cross-functional units</p>
        </div>

        {canManage && (
          <Button
            id="create-dept-btn"
            data-testid="create-dept-btn"
            variant="primary"
            icon={<PlusIcon size={16} />}
            onClick={handleOpenCreate}
          >
            New Department
          </Button>
        )}
      </div>

      <div className="toolbar">
        <div className="search-box">
          <Input
            id="department-search-input"
            data-testid="department-search-input"
            placeholder="Search departments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading && departments.length === 0 ? (
        <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading departments...
        </div>
      ) : departments.length === 0 ? (
        <div className="glass-card empty-state">
          <DepartmentIcon size={40} />
          <h3>No departments found</h3>
          <p>Create departments to structure teams and assign projects to them.</p>
          {canManage && (
            <Button variant="primary" icon={<PlusIcon size={16} />} onClick={handleOpenCreate}>
              Create Department
            </Button>
          )}
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table" id="departments-table" data-testid="departments-table">
            <thead>
              <tr>
                <th>Department Name</th>
                <th>Projects Count</th>
                <th>Created</th>
                {canManage && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {departments.map((dept) => (
                <tr key={dept.id} data-testid={`department-row-${dept.id}`}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: 'var(--radius-md)',
                          background: 'rgba(99, 102, 241, 0.15)',
                          color: 'var(--primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <DepartmentIcon size={16} />
                      </div>
                      <span style={{ fontWeight: 600 }}>{dept.name}</span>
                    </div>
                  </td>
                  <td>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {dept._count?.projects || 0} projects
                    </span>
                  </td>
                  <td>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {new Date(dept.createdAt).toLocaleDateString()}
                    </span>
                  </td>
                  {canManage && (
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                        <Button
                          id={`edit-dept-${dept.id}`}
                          data-testid={`edit-dept-${dept.id}`}
                          variant="secondary"
                          size="sm"
                          icon={<EditIcon size={14} />}
                          onClick={() => handleOpenEdit(dept)}
                          title="Edit department"
                        />
                        <Button
                          id={`delete-dept-${dept.id}`}
                          data-testid={`delete-dept-${dept.id}`}
                          variant="danger"
                          size="sm"
                          icon={<TrashIcon size={14} />}
                          onClick={() => handleDeleteDepartment(dept)}
                          title="Delete department"
                        />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingDept ? 'Edit Department' : 'Create Department'}
      >
        <form onSubmit={handleSaveDepartment} id="department-form">
          {modalError && (
            <div className="toast toast-error" style={{ marginBottom: '1rem', width: '100%' }}>
              <span>{modalError}</span>
            </div>
          )}

          <Input
            id="department-name-input"
            data-testid="department-name-input"
            label="Department Name"
            placeholder="e.g. Engineering, Marketing, Operations"
            value={deptName}
            onChange={(e) => setDeptName(e.target.value)}
            required
            autoFocus
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
              disabled={modalLoading}
            >
              Cancel
            </Button>
            <Button
              id="save-dept-btn"
              data-testid="save-dept-btn"
              type="submit"
              variant="primary"
              isLoading={modalLoading}
            >
              {editingDept ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
