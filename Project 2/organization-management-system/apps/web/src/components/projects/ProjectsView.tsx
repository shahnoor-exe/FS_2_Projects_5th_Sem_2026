import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { apiClient, ApiError } from '../../api/client.js';
import { Project, Department, ProjectStatus } from '../../types/index.js';
import { Button } from '../common/Button.js';
import { Input } from '../common/Input.js';
import { Select } from '../common/Select.js';
import { Badge } from '../common/Badge.js';
import { Modal } from '../common/Modal.js';
import {
  ProjectsIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
} from '../common/Icons.js';

export const ProjectsView: React.FC = () => {
  const { currentOrganization, tenantGeneration } = useAuth();
  const { success, error: toastError } = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('PLANNING');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const role = currentOrganization?.role;
  const canManage = role === 'ORG_ADMIN' || role === 'MANAGER';

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await apiClient.get<Department[]>('/departments');
      setDepartments(res.data);
    } catch {
      // Ignore
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiClient.get<Project[]>('/projects', {
        search: search.trim() || undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
      });
      setProjects(res.data);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to fetch projects');
    } finally {
      setIsLoading(false);
    }
  }, [search, statusFilter, toastError]);

  useEffect(() => {
    fetchDepartments();
    fetchProjects();
  }, [fetchDepartments, fetchProjects, tenantGeneration]);

  const handleOpenCreate = () => {
    setEditingProject(null);
    setName('');
    setDescription('');
    setStatus('PLANNING');
    setDepartmentId(departments.length > 0 ? departments[0].id : '');
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (project: Project) => {
    setEditingProject(project);
    setName(project.name);
    setDescription(project.description || '');
    setStatus(project.status);
    setDepartmentId(project.departmentId || '');
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setModalError('Project name is required');
      return;
    }

    try {
      setModalLoading(true);
      setModalError(null);

      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        status,
        departmentId: departmentId || null,
      };

      if (editingProject) {
        await apiClient.patch(`/projects/${editingProject.id}`, payload);
        success('Project updated successfully');
      } else {
        await apiClient.post('/projects', payload);
        success('Project created successfully');
      }

      setIsModalOpen(false);
      fetchProjects();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to save project';
      setModalError(msg);
      toastError(msg);
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteProject = async (project: Project) => {
    if (!window.confirm(`Delete project "${project.name}" and any attached tasks?`)) {
      return;
    }

    try {
      await apiClient.delete(`/projects/${project.id}`, { cascadeTasks: true });
      success('Project deleted successfully');
      fetchProjects();
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to delete project');
    }
  };

  const getStatusBadgeColor = (st: ProjectStatus) => {
    switch (st) {
      case 'IN_PROGRESS':
        return 'emerald';
      case 'PLANNING':
        return 'indigo';
      case 'ON_HOLD':
        return 'amber';
      case 'COMPLETED':
        return 'cyan';
      case 'CANCELLED':
      default:
        return 'rose';
    }
  };

  return (
    <div id="projects-view">
      <div className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">Track organizational projects, milestones, and task distribution</p>
        </div>

        {canManage && (
          <Button
            id="create-project-btn"
            data-testid="create-project-btn"
            variant="primary"
            icon={<PlusIcon size={16} />}
            onClick={handleOpenCreate}
          >
            New Project
          </Button>
        )}
      </div>

      <div className="toolbar">
        <div style={{ display: 'flex', gap: '1rem', flex: 1, flexWrap: 'wrap' }}>
          <div className="search-box">
            <Input
              id="project-search-input"
              data-testid="project-search-input"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ minWidth: '180px' }}>
            <Select
              id="project-status-filter"
              data-testid="project-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'All Statuses' },
                { value: 'PLANNING', label: 'Planning' },
                { value: 'IN_PROGRESS', label: 'In Progress' },
                { value: 'ON_HOLD', label: 'On Hold' },
                { value: 'COMPLETED', label: 'Completed' },
                { value: 'CANCELLED', label: 'Cancelled' },
              ]}
            />
          </div>
        </div>
      </div>

      {isLoading && projects.length === 0 ? (
        <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading projects...
        </div>
      ) : projects.length === 0 ? (
        <div className="glass-card empty-state">
          <ProjectsIcon size={40} />
          <h3>No projects found</h3>
          <p>Organize initiatives and assign team tasks under projects.</p>
          {canManage && (
            <Button variant="primary" icon={<PlusIcon size={16} />} onClick={handleOpenCreate}>
              Create Project
            </Button>
          )}
        </div>
      ) : (
        <div className="cards-grid">
          {projects.map((proj) => (
            <div
              key={proj.id}
              className="glass-card"
              id={`project-card-${proj.id}`}
              data-testid={`project-card-${proj.id}`}
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <Badge
                  id={`project-status-${proj.id}`}
                  data-testid={`project-status-${proj.id}`}
                  color={getStatusBadgeColor(proj.status)}
                >
                  {proj.status.replace('_', ' ')}
                </Badge>
                {canManage && (
                  <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
                    <Button
                      id={`edit-project-${proj.id}`}
                      data-testid={`edit-project-${proj.id}`}
                      variant="secondary"
                      size="sm"
                      icon={<EditIcon size={13} />}
                      onClick={() => handleOpenEdit(proj)}
                      title="Edit project"
                    />
                    <Button
                      id={`delete-project-${proj.id}`}
                      data-testid={`delete-project-${proj.id}`}
                      variant="danger"
                      size="sm"
                      icon={<TrashIcon size={13} />}
                      onClick={() => handleDeleteProject(proj)}
                      title="Delete project"
                    />
                  </div>
                )}
              </div>

              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: '0.5rem' }}>
                {proj.name}
              </h3>

              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', flex: 1 }}>
                {proj.description || 'No description provided'}
              </p>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span>Department:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {proj.department?.name || 'None'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Tasks:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {proj._count?.tasks || 0}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Project Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProject ? 'Edit Project' : 'Create Project'}
      >
        <form onSubmit={handleSaveProject} id="project-form">
          {modalError && (
            <div className="toast toast-error" style={{ marginBottom: '1rem', width: '100%' }}>
              <span>{modalError}</span>
            </div>
          )}

          <Input
            id="project-name-input"
            data-testid="project-name-input"
            label="Project Name"
            placeholder="e.g. Mobile App Redesign"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />

          <div className="form-group">
            <label htmlFor="project-desc-input" className="form-label">
              Description
            </label>
            <textarea
              id="project-desc-input"
              data-testid="project-desc-input"
              className="form-textarea"
              rows={3}
              placeholder="Scope and goals..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <Select
            id="project-status-select"
            data-testid="project-status-select"
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            options={[
              { value: 'PLANNING', label: 'Planning' },
              { value: 'IN_PROGRESS', label: 'In Progress' },
              { value: 'ON_HOLD', label: 'On Hold' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ]}
          />

          <Select
            id="project-dept-select"
            data-testid="project-dept-select"
            label="Department"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            options={[
              { value: '', label: 'None (Unassigned)' },
              ...departments.map((d) => ({ value: d.id, label: d.name })),
            ]}
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
              id="save-project-btn"
              data-testid="save-project-btn"
              type="submit"
              variant="primary"
              isLoading={modalLoading}
            >
              {editingProject ? 'Update Project' : 'Create Project'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
