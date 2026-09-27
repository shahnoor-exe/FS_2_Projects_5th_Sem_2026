import { test, expect } from '@playwright/test';
import {
  createTestTenant,
  cleanDatabaseByPattern,
  TEST_PASSWORD,
  generateRunId,
  addMemberToTenant,
  registerSoloUser,
} from './test-helpers.js';

test.describe('OrgSphere Phase 5 Core User Journeys', () => {
  const suiteId = generateRunId('core');

  test.afterAll(async () => {
    cleanDatabaseByPattern(suiteId);
  });

  test('Journey 1: Organization Registration, In-Memory Session & Dashboard Baseline', async ({ page, request }) => {
    const runId = `${suiteId}_reg`;
    const adminEmail = `${runId}@orgsphere.test`;
    const orgName = `Apex Global ${runId}`;

    // 1. Visit root - redirects to Login Form
    await page.goto('/');
    await expect(page.locator('#login-card')).toBeVisible();

    // 2. Switch to Registration
    await page.click('#switch-to-register-btn');
    await expect(page.locator('#register-card')).toBeVisible();

    // 3. Register fresh tenant
    await page.fill('#register-org-name', orgName);
    await page.fill('#register-first-name', 'Alice');
    await page.fill('#register-last-name', 'Admin');
    await page.fill('#register-email', adminEmail);
    await page.fill('#register-password', TEST_PASSWORD);
    await page.click('#register-submit-btn');

    // 4. Arrive at Dashboard
    await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#dashboard-org-title')).toContainText(orgName);
    await expect(page.locator('#user-role-badge')).toHaveText('ORG_ADMIN');

    // 5. Verify live baseline KPI counters
    await expect(page.locator('[data-testid="metric-members-card-value"]')).toHaveText('1');
    await expect(page.locator('[data-testid="metric-departments-card-value"]')).toHaveText('0');
    await expect(page.locator('[data-testid="metric-projects-card-value"]')).toHaveText('0');
    await expect(page.locator('[data-testid="metric-tasks-card-value"]')).toHaveText('0');
  });

  test('Journey 2: Department and Project Creation with Table Synchronization', async ({ page, request }) => {
    const tenant = await createTestTenant(request, `${suiteId}_dept`);

    // Log in via UI
    await page.goto('/');
    await page.fill('#login-email', tenant.adminEmail);
    await page.fill('#login-password', tenant.adminPassword);
    await page.click('#login-submit-btn');
    await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 15000 });

    // Navigate to Departments
    await page.click('#nav-departments');
    await expect(page.locator('#departments-view')).toBeVisible();

    // Create Department
    await page.click('#create-dept-btn');
    await expect(page.locator('#department-form')).toBeVisible();
    await page.fill('#department-name-input', 'Core Infrastructure');
    await page.click('#save-dept-btn');
    await expect(page.locator('#departments-table')).toContainText('Core Infrastructure');

    // Navigate to Projects
    await page.click('#nav-projects');
    await expect(page.locator('#projects-view')).toBeVisible();

    // Create Project assigned to department
    await page.click('#create-project-btn');
    await expect(page.locator('#project-form')).toBeVisible();
    await page.fill('#project-name-input', 'Telemetry Pipeline');
    await page.selectOption('#project-status-select', 'IN_PROGRESS');

    const deptSelect = page.locator('#project-dept-select');
    const options = await deptSelect.locator('option').allTextContents();
    const targetDept = options.find((o) => o.includes('Core Infrastructure'));
    if (targetDept) {
      await deptSelect.selectOption({ label: targetDept });
    }
    await page.click('#save-project-btn');

    // Verify card in project grid
    await expect(page.locator('.cards-grid')).toContainText('Telemetry Pipeline');
    await expect(page.locator('.cards-grid')).toContainText('IN PROGRESS');
  });

  test('Journey 3: Task Creation and Project Deletion with Confirmation & Cascade', async ({ page, request }) => {
    const tenant = await createTestTenant(request, `${suiteId}_cascade`);

    // Log in via UI
    await page.goto('/');
    await page.fill('#login-email', tenant.adminEmail);
    await page.fill('#login-password', tenant.adminPassword);
    await page.click('#login-submit-btn');
    await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 15000 });

    // Create Project via UI
    await page.click('#nav-projects');
    await page.click('#create-project-btn');
    await page.fill('#project-name-input', 'Temporary Project');
    await page.click('#save-project-btn');
    await expect(page.locator('.cards-grid')).toContainText('Temporary Project');

    // Create Task under this project
    await page.click('#nav-tasks');
    await page.click('#create-task-btn');
    await page.fill('#task-title-input', 'Cascading Task 1');
    await page.click('#save-task-btn');
    await expect(page.locator('#tasks-table')).toContainText('Cascading Task 1');

    // Return to Projects and delete with confirmation dialog
    await page.click('#nav-projects');
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('Delete project');
      dialog.accept();
    });

    const projectCard = page.locator('.glass-card', { hasText: 'Temporary Project' });
    await projectCard.locator('button[title="Delete project"]').click();

    // Verify Project removed from UI
    await expect(page.locator('#projects-view')).not.toContainText('Temporary Project');
    await expect(page.locator('#projects-view')).toContainText('No projects found');

    // Verify cascaded tasks are removed
    await page.click('#nav-tasks');
    await expect(page.locator('#tasks-view')).toBeVisible();
    await expect(page.locator('#tasks-view')).not.toContainText('Cascading Task 1');
  });

  test('Journey 4: Add Existing User with Role Configuration', async ({ page, request }) => {
    const tenant = await createTestTenant(request, `${suiteId}_member`);
    const soloUser = await registerSoloUser(request, `${suiteId}_solo@orgsphere.test`, 'Bob', 'Smith');

    // Log in as Admin
    await page.goto('/');
    await page.fill('#login-email', tenant.adminEmail);
    await page.fill('#login-password', tenant.adminPassword);
    await page.click('#login-submit-btn');
    await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 15000 });

    // Navigate to Members view
    await page.click('#nav-members');
    await expect(page.locator('#members-view')).toBeVisible();

    // Open "Add existing user" modal (verified label)
    await page.click('#add-member-btn');
    await expect(page.locator('#add-member-form')).toBeVisible();

    await page.fill('#add-member-email-input', `${suiteId}_solo@orgsphere.test`);
    await page.selectOption('#add-member-role-select', 'MANAGER');
    await page.click('#confirm-add-member-btn');

    // Verify member appears in table with MANAGER badge
    const memberRow = page.locator('#members-table tr', { hasText: 'Bob Smith' });
    await expect(memberRow).toBeVisible();
    await expect(memberRow).toContainText('MANAGER');
  });

  test('Journey 5: Multi-Tenant Switch, In-Memory Token Swap & Page Reload Persistence', async ({
    page,
    request,
  }) => {
    const runId = `${suiteId}_switch`;
    // Tenant A
    const tenantA = await createTestTenant(request, `${runId}_a`);
    // Tenant B
    const tenantB = await createTestTenant(request, `${runId}_b`);

    // Add tenantA's admin as ORG_ADMIN in tenantB
    await addMemberToTenant(request, tenantB.accessToken, tenantA.adminEmail, 'ORG_ADMIN');

    // Log in as Alice (member of both tenants)
    await page.goto('/');
    await page.fill('#login-email', tenantA.adminEmail);
    await page.fill('#login-password', tenantA.adminPassword);
    await page.click('#login-submit-btn');
    await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#dashboard-org-title')).toContainText(tenantA.orgName);

    // Switcher dropdown contains both organizations
    const switcher = page.locator('#org-switcher-select');
    await expect(switcher).toContainText(tenantB.orgName);

    // Switch to Tenant B
    await switcher.selectOption({ value: tenantB.orgId });

    // Title updates to Tenant B
    await expect(page.locator('#dashboard-org-title')).toContainText(tenantB.orgName, { timeout: 10000 });

    // CRITICAL: Reload page -> browser calls /api/v1/auth/refresh with rotated cookie
    await page.reload();

    // Active session remains Tenant B
    await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#dashboard-org-title')).toContainText(tenantB.orgName);
    await expect(page.locator('#org-switcher-select')).toHaveValue(tenantB.orgId);
  });

  test('Journey 6: User Logout and Protected Route Redirection', async ({ page, request }) => {
    const tenant = await createTestTenant(request, `${suiteId}_logout`);

    await page.goto('/');
    await page.fill('#login-email', tenant.adminEmail);
    await page.fill('#login-password', tenant.adminPassword);
    await page.click('#login-submit-btn');
    await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 15000 });

    // Click Logout
    await page.click('#logout-button');
    await expect(page.locator('#login-card')).toBeVisible();

    // Reloading remains on login screen because HttpOnly cookie was cleared
    await page.reload();
    await expect(page.locator('#login-card')).toBeVisible();
  });
});
