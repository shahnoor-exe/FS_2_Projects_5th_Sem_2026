import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { apiClient, ApiError } from '../../api/client.js';
import { Task, Project, Membership, TaskStatus, TaskPriority } from '../../types/index.js';
import { Button } from '../common/Button.js';
import { Input } from '../common/Input.js';
import { Select } from '../common/Select.js';
import { Badge } from '../common/Badge.js';
import { Modal } from '../common/Modal.js';
import {
  TasksIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
} from '../common/Icons.js';

export const TasksView: React.FC = () => {
  const { user, currentOrganization, tenantGeneration } = useAuth();
  const { success, error: toastError } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [projectId, setProjectId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const role = currentOrganization?.role;
  const canManage = role === 'ORG_ADMIN' || role === 'MANAGER';
  const isEmployee = role === 'EMPLOYEE';

  const fetchAuxData = useCallback(async () => {
    try {
      const [projRes, memRes] = await Promise.all([
        apiClient.get<Project[]>('/projects'),
        apiClient.get<Membership[]>('/memberships'),
      ]);
      setProjects(projRes.data);
      setMembers(memRes.data);
    } catch {
      // Ignore
    }
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiClient.get<Task[]>('/tasks', {
        search: search.trim() || undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        priority: priorityFilter !== 'ALL' ? priorityFilter : undefined,
      });
      setTasks(res.data);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to fetch tasks');
    } finally {
      setIsLoading(false);
    }
  }, [search, statusFilter, priorityFilter, toastError]);

  useEffect(() => {
    fetchAuxData();
    fetchTasks();
  }, [fetchAuxData, fetchTasks, tenantGeneration]);

  const handleOpenCreate = () => {
    setEditingTask(null);
    setTitle('');
    setDescription('');
    setStatus('TODO');
    setPriority('MEDIUM');
    setProjectId(projects.length > 0 ? projects[0].id : '');
    setAssigneeId('');
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (task: Task) => {
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description || '');
    setStatus(task.status);
    setPriority(task.priority);
    setProjectId(task.projectId);
    setAssigneeId(task.assigneeId || '');
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setModalError('Task title is required');
      return;
    }

    try {
      setModalLoading(true);
      setModalError(null);

      if (editingTask) {
        if (canManage) {
          await apiClient.patch(`/tasks/${editingTask.id}`, {
            title: title.trim(),
            description: description.trim() || null,
            status,
            priority,
            projectId,
            assigneeId: assigneeId || null,
          });
        } else if (isEmployee && editingTask.assigneeId === user?.id) {
          // Employee limited update
          await apiClient.patch(`/tasks/${editingTask.id}`, {
            status,
            description: description.trim() || null,
          });
        }
        success('Task updated successfully');
      } else {
        const targetProjectId = projectId || (projects.length > 0 ? projects[0].id : '');
        if (!targetProjectId) {
          setModalError('Project must be selected to create a task');
          return;
        }
        await apiClient.post('/tasks', {
          title: title.trim(),
          description: description.trim() || null,
          status,
          priority,
          projectId: targetProjectId,
          assigneeId: assigneeId || null,
        });
        success('Task created successfully');
      }

      setIsModalOpen(false);
      fetchTasks();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to save task';
      setModalError(msg);
      toastError(msg);
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteTask = async (task: Task) => {
    if (!window.confirm(`Are you sure you want to delete task "${task.title}"?`)) {
      return;
    }

    try {
      await apiClient.delete(`/tasks/${task.id}`);
      success('Task deleted successfully');
      fetchTasks();
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to delete task');
    }
  };

  const getPriorityBadgeColor = (p: TaskPriority) => {
    switch (p) {
      case 'URGENT':
        return 'rose';
      case 'HIGH':
        return 'amber';
      case 'MEDIUM':
        return 'indigo';
      case 'LOW':
      default:
        return 'cyan';
    }
  };

  const getStatusBadgeColor = (st: TaskStatus) => {
    switch (st) {
      case 'DONE':
        return 'emerald';
      case 'IN_PROGRESS':
        return 'cyan';
      case 'IN_REVIEW':
        return 'amber';
      case 'TODO':
      default:
        return 'indigo';
    }
  };

  return (
    <div id="tasks-view">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">Manage assignments, execution status, and priority workflows</p>
        </div>

        {canManage && (
          <Button
            id="create-task-btn"
            data-testid="create-task-btn"
            variant="primary"
            icon={<PlusIcon size={16} />}
            onClick={handleOpenCreate}
          >
            New Task
          </Button>
        )}
      </div>

      <div className="toolbar">
        <div style={{ display: 'flex', gap: '1rem', flex: 1, flexWrap: 'wrap' }}>
          <div className="search-box">
            <Input
              id="task-search-input"
              data-testid="task-search-input"
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ minWidth: '160px' }}>
            <Select
              id="task-status-filter"
              data-testid="task-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'All Statuses' },
                { value: 'TODO', label: 'To Do' },
                { value: 'IN_PROGRESS', label: 'In Progress' },
                { value: 'IN_REVIEW', label: 'In Review' },
                { value: 'DONE', label: 'Done' },
              ]}
            />
          </div>

          <div style={{ minWidth: '160px' }}>
            <Select
              id="task-priority-filter"
              data-testid="task-priority-filter"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              options={[
                { value: 'ALL', label: 'All Priorities' },
                { value: 'LOW', label: 'Low' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'HIGH', label: 'High' },
                { value: 'URGENT', label: 'Urgent' },
              ]}
            />
          </div>
        </div>
      </div>

      {isLoading && tasks.length === 0 ? (
        <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading tasks...
        </div>
      ) : tasks.length === 0 ? (
        <div className="glass-card empty-state">
          <TasksIcon size={40} />
          <h3>No tasks found</h3>
          <p>Create actionable tasks tied to projects and assign team members.</p>
          {canManage && (
            <Button variant="primary" icon={<PlusIcon size={16} />} onClick={handleOpenCreate}>
              Create Task
            </Button>
          )}
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table" id="tasks-table" data-testid="tasks-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Project</th>
                <th>Assignee</th>
                {(canManage || isEmployee) && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const isAssignedToUser = task.assigneeId === user?.id;
                const canEditThis = canManage || (isEmployee && isAssignedToUser);

                return (
                  <tr key={task.id} data-testid={`task-row-${task.id}`}>
                    <td>
                      <div>
                        <div style={{ fontWeight: 600 }}>{task.title}</div>
                        {task.description && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {task.description.length > 60
                              ? `${task.description.substring(0, 60)}...`
                              : task.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <Badge
                        id={`task-status-badge-${task.id}`}
                        data-testid={`task-status-badge-${task.id}`}
                        color={getStatusBadgeColor(task.status)}
                      >
                        {task.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td>
                      <Badge color={getPriorityBadgeColor(task.priority)}>
                        {task.priority}
                      </Badge>
                    </td>
                    <td>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {task.project?.name || 'Unassigned'}
                      </span>
                    </td>
                    <td>
                      {(() => {
                        const assigneeUser = task.assignee?.user || (task.assignee?.firstName ? task.assignee : null);
                        return assigneeUser ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div className="user-avatar" style={{ width: '24px', height: '24px', fontSize: '0.7rem' }}>
                              {assigneeUser.firstName ? assigneeUser.firstName[0] : '?'}
                              {assigneeUser.lastName ? assigneeUser.lastName[0] : ''}
                            </div>
                            <span style={{ fontSize: '0.85rem' }}>
                              {assigneeUser.firstName} {assigneeUser.lastName}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Unassigned</span>
                        );
                      })()}
                    </td>
                    {(canManage || isEmployee) && (
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                          {canEditThis && (
                            <Button
                              id={`edit-task-${task.id}`}
                              data-testid={`edit-task-${task.id}`}
                              variant="secondary"
                              size="sm"
                              icon={<EditIcon size={13} />}
                              onClick={() => handleOpenEdit(task)}
                              title="Edit task"
                            />
                          )}
                          {canManage && (
                            <Button
                              id={`delete-task-${task.id}`}
                              data-testid={`delete-task-${task.id}`}
                              variant="danger"
                              size="sm"
                              icon={<TrashIcon size={13} />}
                              onClick={() => handleDeleteTask(task)}
                              title="Delete task"
                            />
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Task Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTask ? 'Edit Task' : 'Create Task'}
      >
        <form onSubmit={handleSaveTask} id="task-form">
          {modalError && (
            <div className="toast toast-error" style={{ marginBottom: '1rem', width: '100%' }}>
              <span>{modalError}</span>
            </div>
          )}

          <Input
            id="task-title-input"
            data-testid="task-title-input"
            label="Title"
            placeholder="e.g. Implement refresh token rotation"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={editingTask ? !canManage : false}
            required
            autoFocus
          />

          <div className="form-group">
            <label htmlFor="task-desc-input" className="form-label">
              Description
            </label>
            <textarea
              id="task-desc-input"
              data-testid="task-desc-input"
              className="form-textarea"
              rows={3}
              placeholder="Task details and acceptance criteria..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Select
              id="task-status-select"
              data-testid="task-status-select"
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              options={[
                { value: 'TODO', label: 'To Do' },
                { value: 'IN_PROGRESS', label: 'In Progress' },
                { value: 'IN_REVIEW', label: 'In Review' },
                { value: 'DONE', label: 'Done' },
              ]}
            />

            <Select
              id="task-priority-select"
              data-testid="task-priority-select"
              label="Priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              disabled={editingTask ? !canManage : false}
              options={[
                { value: 'LOW', label: 'Low' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'HIGH', label: 'High' },
                { value: 'URGENT', label: 'Urgent' },
              ]}
            />
          </div>

          {canManage && (
            <>
              <Select
                id="task-project-select"
                data-testid="task-project-select"
                label="Project"
                value={projectId || (projects.length > 0 ? projects[0].id : '')}
                onChange={(e) => setProjectId(e.target.value)}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                required
              />

              <Select
                id="task-assignee-select"
                data-testid="task-assignee-select"
                label="Assignee"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                options={[
                  { value: '', label: 'Unassigned' },
                  ...members.map((m) => ({
                    value: m.userId,
                    label: `${m.user.firstName} ${m.user.lastName} (${m.role.name})`,
                  })),
                ]}
              />
            </>
          )}

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
              id="save-task-btn"
              data-testid="save-task-btn"
              type="submit"
              variant="primary"
              isLoading={modalLoading}
            >
              {editingTask ? 'Update Task' : 'Create Task'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
