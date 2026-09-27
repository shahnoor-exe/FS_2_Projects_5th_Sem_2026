import { APIRequestContext, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { SystemRoleType } from '@orgsphere/shared';

export const TEST_PASSWORD = 'ValidPassword1234!';

export interface TestTenant {
  runId: string;
  adminEmail: string;
  adminPassword: string;
  orgName: string;
  orgId: string;
  accessToken: string;
  userId: string;
}

export function generateRunId(prefix = 't'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
}

export function resetRedisRateLimits() {
  try {
    execSync('docker exec -i orgsphere-redis redis-cli FLUSHDB', { stdio: 'pipe' });
  } catch {
    // Ignore
  }
}

export async function createTestTenant(request: APIRequestContext, prefix = 'org'): Promise<TestTenant> {
  resetRedisRateLimits();
  const runId = generateRunId(prefix);
  const adminEmail = `${runId}@orgsphere.test`;
  const orgName = `Org ${runId}`;

  const res = await request.post('/api/v1/auth/register', {
    headers: { 'X-OrgSphere-Client': 'web' },
    data: {
      organizationName: orgName,
      firstName: 'Admin',
      lastName: 'User',
      email: adminEmail,
      password: TEST_PASSWORD,
    },
  });

  expect(res.status()).toBe(201);
  const json = await res.json();

  return {
    runId,
    adminEmail,
    adminPassword: TEST_PASSWORD,
    orgName,
    orgId: json.data.organization.id,
    accessToken: json.data.accessToken,
    userId: json.data.user.id,
  };
}

export async function registerSoloUser(request: APIRequestContext, email: string, firstName = 'Test', lastName = 'User') {
  resetRedisRateLimits();
  const orgName = `Solo ${email.split('@')[0]}`;
  const res = await request.post('/api/v1/auth/register', {
    headers: { 'X-OrgSphere-Client': 'web' },
    data: {
      organizationName: orgName,
      firstName,
      lastName,
      email,
      password: TEST_PASSWORD,
    },
  });
  expect(res.status()).toBe(201);
  const json = await res.json();
  const soloOrgId = json.data.organization.id;

  try {
    const cleanupSql = `
      DELETE FROM audit_logs WHERE organization_id = '${soloOrgId}';
      DELETE FROM refresh_tokens WHERE organization_id = '${soloOrgId}';
      DELETE FROM organization_memberships WHERE organization_id = '${soloOrgId}';
      DELETE FROM organizations WHERE id = '${soloOrgId}';
    `.replace(/\r?\n/g, ' ');
    execSync(`docker exec -i orgsphere-postgres psql -U postgres -d orgsphere_dev -c "${cleanupSql}"`, {
      stdio: 'pipe',
    });
  } catch (e) {
    // Non-fatal if cleanup already processed
  }

  return {
    user: json.data.user,
    accessToken: json.data.accessToken,
    orgId: soloOrgId,
  };
}

export async function addMemberToTenant(
  request: APIRequestContext,
  adminToken: string,
  userEmail: string,
  role: SystemRoleType
) {
  const res = await request.post('/api/v1/memberships', {
    headers: {
      'X-OrgSphere-Client': 'web',
      Authorization: `Bearer ${adminToken}`,
    },
    data: {
      email: userEmail,
      role,
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data;
}

export function cleanDatabaseByPattern(pattern: string) {
  try {
    const sql = `
      DELETE FROM audit_logs WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%${pattern}%');
      DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%${pattern}%');
      DELETE FROM tasks WHERE organization_id IN (SELECT id FROM organizations WHERE name LIKE '%${pattern}%');
      DELETE FROM projects WHERE organization_id IN (SELECT id FROM organizations WHERE name LIKE '%${pattern}%');
      DELETE FROM departments WHERE organization_id IN (SELECT id FROM organizations WHERE name LIKE '%${pattern}%');
      DELETE FROM organization_memberships WHERE organization_id IN (SELECT id FROM organizations WHERE name LIKE '%${pattern}%') OR user_id IN (SELECT id FROM users WHERE email LIKE '%${pattern}%');
      DELETE FROM organizations WHERE name LIKE '%${pattern}%';
      DELETE FROM users WHERE email LIKE '%${pattern}%';
    `.replace(/\r?\n/g, ' ');

    execSync(`docker exec -i orgsphere-postgres psql -U postgres -d orgsphere_dev -c "${sql}"`, {
      stdio: 'pipe',
    });
    execSync('docker exec -i orgsphere-redis redis-cli FLUSHDB', { stdio: 'pipe' });
  } catch (e) {
    console.error('Cleanup warning for pattern', pattern, e);
  }
}
