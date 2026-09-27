import { test, expect } from '@playwright/test';
import {
  createTestTenant,
  cleanDatabaseByPattern,
  TEST_PASSWORD,
  generateRunId,
  addMemberToTenant,
  registerSoloUser,
} from './test-helpers.js';

test.describe('OrgSphere RBAC Sessions & Permission Guardrails', () => {
  const suiteId = generateRunId('rbac');

  test.afterAll(async () => {
    cleanDatabaseByPattern(suiteId);
  });

  test('RBAC 1: Manager Session — Project & Task Management with Admin Tab Restrictions', async ({
    page,
    request,
  }) => {
    const tenant = await createTestTenant(request, `${suiteId}_mgr`);
    const managerEmail = `${suiteId}_manager@orgsphere.test`;
    await registerSoloUser(request, managerEmail, 'Manny', 'Manager');
    await addMemberToTenant(request, tenant.accessToken, managerEmail, 'MANAGER');

    // Log in as Manager
    await page.goto('/');
    await page.fill('#login-email', managerEmail);
    await page.fill('#login-password', TEST_PASSWORD);
    await page.click('#login-submit-btn');

    // 1. Verify Role Badge
    await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 15000 });
    const orgSwitcher = page.locator('#org-switcher-select');
    if ((await orgSwitcher.count()) > 0 && (await orgSwitcher.inputValue()) !== tenant.orgId) {
      await orgSwitcher.selectOption(tenant.orgId);
    }
    await expect(page.locator('#user-role-badge')).toHaveText('MANAGER');

    // 2. Verify Manager has access to Projects and Tasks
    await expect(page.locator('#nav-projects')).toBeVisible();
    await expect(page.locator('#nav-tasks')).toBeVisible();

    // 3. Verify Manager can create a Department
    await page.click('#nav-departments');
    await expect(page.locator('#create-dept-btn')).toBeVisible();

    // 4. Verify Denied Administrative Views: Audit Logs and Settings are NOT in the DOM
    await expect(page.locator('#nav-audit')).toHaveCount(0);
    await expect(page.locator('#nav-settings')).toHaveCount(0);
  });

  test('RBAC 2: Employee Session — Restricted Task Editing and Creation Guardrails', async ({
    page,
    request,
  }) => {
    const tenant = await createTestTenant(request, `${suiteId}_emp`);
    const empEmail = `${suiteId}_employee@orgsphere.test`;
    const empUser = await registerSoloUser(request, empEmail, 'Emma', 'Employee');
    await addMemberToTenant(request, tenant.accessToken, empEmail, 'EMPLOYEE');

    // Admin creates a project and two tasks: one assigned to Emma, one unassigned
    const projRes = await request.post('/api/v1/projects', {
      headers: {
        'X-OrgSphere-Client': 'web',
        Authorization: `Bearer ${tenant.accessToken}`,
      },
      data: { name: 'Employee Demo Project', status: 'IN_PROGRESS' },
    });
    const projId = (await projRes.json()).data.id;

    // Assigned Task
    const assignedTaskRes = await request.post('/api/v1/tasks', {
      headers: {
        'X-OrgSphere-Client': 'web',
        Authorization: `Bearer ${tenant.accessToken}`,
      },
      data: {
        title: 'Assigned to Emma',
        projectId: projId,
        assigneeId: empUser.user.id,
        status: 'TODO',
      },
    });
    expect(assignedTaskRes.status()).toBe(201);
    const assignedTaskId = (await assignedTaskRes.json()).data.id;

    // Unassigned Task
    const unassignedTaskRes = await request.post('/api/v1/tasks', {
      headers: {
        'X-OrgSphere-Client': 'web',
        Authorization: `Bearer ${tenant.accessToken}`,
      },
      data: {
        title: 'Unassigned Task',
        projectId: projId,
        status: 'TODO',
      },
    });
    expect(unassignedTaskRes.status()).toBe(201);
    const unassignedTaskId = (await unassignedTaskRes.json()).data.id;

    // Log in as Employee
    await page.goto('/');
    await page.fill('#login-email', empEmail);
    await page.fill('#login-password', TEST_PASSWORD);
    await page.click('#login-submit-btn');

    // 1. Verify Role Badge
    await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 15000 });
    const orgSwitcher = page.locator('#org-switcher-select');
    if ((await orgSwitcher.count()) > 0 && (await orgSwitcher.inputValue()) !== tenant.orgId) {
      await orgSwitcher.selectOption(tenant.orgId);
    }
    await expect(page.locator('#user-role-badge')).toHaveText('EMPLOYEE');

    // 2. Verify Employee cannot create Departments or Projects (Buttons hidden)
    await page.click('#nav-departments');
    await expect(page.locator('#create-dept-btn')).toHaveCount(0);

    await page.click('#nav-projects');
    await expect(page.locator('#create-project-btn')).toHaveCount(0);

    // 3. Navigate to Tasks
    await page.click('#nav-tasks');
    await expect(page.locator('#tasks-view')).toBeVisible();
    await expect(page.locator('#create-task-btn')).toHaveCount(0);

    // 4. Proves Employee can edit assigned task status
    const assignedRow = page.locator(`[data-testid="task-row-${assignedTaskId}"]`);
    await expect(assignedRow).toBeVisible();
    await assignedRow.locator(`[data-testid="edit-task-${assignedTaskId}"]`).click();

    // Title input is disabled for Employee
    await expect(page.locator('#task-title-input')).toBeDisabled();
    await expect(page.locator('#task-priority-select')).toBeDisabled();

    // Status is editable
    await page.selectOption('#task-status-select', 'DONE');
    await page.click('#save-task-btn');

    // Verify task updated to DONE in UI
    await expect(page.locator(`[data-testid="task-status-badge-${assignedTaskId}"]`)).toHaveText('DONE');

    // 5. Proves Employee cannot edit unassigned task
    const unassignedRow = page.locator(`[data-testid="task-row-${unassignedTaskId}"]`);
    await expect(unassignedRow.locator(`[data-testid="edit-task-${unassignedTaskId}"]`)).toHaveCount(0);

    // 6. Proves direct API mutation on unassigned task is denied (403)
    const empLoginRes = await request.post('/api/v1/auth/login', {
      headers: { 'X-OrgSphere-Client': 'web' },
      data: { email: empEmail, password: TEST_PASSWORD },
    });
    const empToken = (await empLoginRes.json()).data.accessToken;

    const deniedUpdateRes = await request.patch(`/api/v1/tasks/${unassignedTaskId}`, {
      headers: {
        'X-OrgSphere-Client': 'web',
        Authorization: `Bearer ${empToken}`,
      },
      data: { status: 'DONE' },
    });
    expect(deniedUpdateRes.status()).toBe(403);
  });

  test('RBAC 3: Viewer Session — Read-Only Access & Denied Mutations', async ({
    page,
    request,
  }) => {
    const tenant = await createTestTenant(request, `${suiteId}_view`);
    const viewerEmail = `${suiteId}_viewer@orgsphere.test`;
    await registerSoloUser(request, viewerEmail, 'Victor', 'Viewer');
    await addMemberToTenant(request, tenant.accessToken, viewerEmail, 'VIEWER');

    // Admin creates a department
    await request.post('/api/v1/departments', {
      headers: {
        'X-OrgSphere-Client': 'web',
        Authorization: `Bearer ${tenant.accessToken}`,
      },
      data: { name: 'Viewer Testing Dept' },
    });

    // Log in as Viewer
    await page.goto('/');
    await page.fill('#login-email', viewerEmail);
    await page.fill('#login-password', TEST_PASSWORD);
    await page.click('#login-submit-btn');

    // 1. Verify Role Badge
    await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 15000 });
    const orgSwitcher = page.locator('#org-switcher-select');
    if ((await orgSwitcher.count()) > 0 && (await orgSwitcher.inputValue()) !== tenant.orgId) {
      await orgSwitcher.selectOption(tenant.orgId);
    }
    await expect(page.locator('#user-role-badge')).toHaveText('VIEWER');

    // 2. Verify all mutation actions are hidden across tabs
    await page.click('#nav-departments');
    await expect(page.locator('#create-dept-btn')).toHaveCount(0);
    await expect(page.locator('button[title="Edit department"]')).toHaveCount(0);
    await expect(page.locator('button[title="Delete department"]')).toHaveCount(0);

    await page.click('#nav-projects');
    await expect(page.locator('#create-project-btn')).toHaveCount(0);

    await page.click('#nav-tasks');
    await expect(page.locator('#create-task-btn')).toHaveCount(0);

    await page.click('#nav-members');
    await expect(page.locator('#add-member-btn')).toHaveCount(0);

    // 3. Admin-only tabs absent
    await expect(page.locator('#nav-audit')).toHaveCount(0);
    await expect(page.locator('#nav-settings')).toHaveCount(0);

    // 4. Proves direct mutation by Viewer is rejected with 403 Forbidden
    const viewerLoginRes = await request.post('/api/v1/auth/login', {
      headers: { 'X-OrgSphere-Client': 'web' },
      data: { email: viewerEmail, password: TEST_PASSWORD },
    });
    const viewerToken = (await viewerLoginRes.json()).data.accessToken;

    const deniedCreateProject = await request.post('/api/v1/projects', {
      headers: {
        'X-OrgSphere-Client': 'web',
        Authorization: `Bearer ${viewerToken}`,
      },
      data: { name: 'Unauthorized Viewer Project' },
    });
    expect(deniedCreateProject.status()).toBe(403);
  });
});
