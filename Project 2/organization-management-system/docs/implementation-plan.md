# OrgSphere Implementation Plan & Acceptance Criteria

## Phase Breakdown

### Phase 1: Architecture & Backend Foundation
- **Status**: Completed & verified in local development / integration test environment.
- **Scope**:
  - Monorepo directory structure setup with npm workspaces (`@orgsphere/shared`, `@orgsphere/api`, `@orgsphere/web`).
  - Complete documentation suite (`architecture.md`, `api-contract.md`, `database-design.md`, `security.md`, `implementation-plan.md`).
  - Docker Compose service definition (`postgres` on host 5433 / container 5432, `redis` on host 6379, `api` on 4000, `web` on 3000).
  - PostgreSQL schema with **all 11 entities**:
    1. `User`
    2. `Organization`
    3. `OrganizationMembership`
    4. `Role`
    5. `Permission`
    6. `RolePermission`
    7. `Department`
    8. `Project`
    9. `Task`
    10. `RefreshToken`
    11. `AuditLog`
  - Multi-tenant integrity constraints using composite foreign keys.
  - Express API foundation: correlation IDs, structured Pino logging, OpenTelemetry tracing with HTTP transport fallback, standardized response envelope, global error handler.
  - Initial endpoints: `/api/v1/health`, `/ready`, `/version`, `/docs`.
- **Verified Evidence**:
  - `npm run typecheck` passes with zero TypeScript errors.
  - `npm run prisma:validate` passes with zero schema errors.
  - Health, readiness probe, and version endpoints return 200 OK with expected JSON envelope.
  - OpenAPI 3.0 documentation loads cleanly at `/api/v1/docs`.
- **Delivery Limitations**:
  - Full multi-container Docker Compose build/orchestration for API & Web containers simultaneously (`docker compose up` for application containers) and cloud production deployment remain unverified.

---

### Phase 2: Authentication, RBAC, Encryption & Audit Logging
- **Status**: Completed & verified in local development / integration test environment.
- **Scope**:
  - Registration with automatic organization creation.
  - Login, logout, and token refresh with rotating refresh tokens in HttpOnly, `SameSite=Strict` cookies scoped to `/api/v1/auth`.
  - Storing only cryptographically hashed refresh tokens in the database.
  - Token rotation with atomic 5-second duplicate grace window and family-wide theft revocation.
  - Multi-tenant session switching via `/api/v1/auth/switch-org` requiring current refresh cookie and CSRF validation.
  - Role-based access control (`ORG_ADMIN`, `MANAGER`, `EMPLOYEE`, `VIEWER`) and platform roles (`SUPER_ADMIN`, `USER`).
  - AES-256-GCM encryption for phone numbers and sensitive PII.
  - Audit logging for mutations and auth events with actor, IP, tenant, and request ID.
- **Verified Evidence**:
  - Unauthenticated requests return 401.
  - Insufficient role requests return 403.
  - Cross-organization resource access returns 404.
  - Rotating refresh token revokes previous token upon use; concurrent duplicate requests within grace window succeed without theft trigger.
  - Sensitive PII fields properly encrypted in PostgreSQL.

---

### Phase 3: Core Organization Management APIs
- **Status**: Completed & verified in local development / integration test environment.
- **Scope**:
  - RESTful CRUD modules for Organizations, Departments, Memberships, Projects, and Tasks.
  - Department management (`dept:manage`) restricted to `ORG_ADMIN`. `MANAGER` has read-only department visibility (`dept:read`).
  - Department reassignment and deletion guards (preventing deletion if active projects are linked).
  - Project status workflows and ownership assignment; project deletion with cascade task confirmation.
  - Task assignment workflows with employee self-update restrictions: employees can update **status** and **description** of their assigned tasks only; title, priority, project, and assignee fields are immutable.
  - Direct mutations on unassigned tasks rejected with `403 Forbidden`.
  - Complete integration test suite across isolated test organizations.
- **Verified Evidence**:
  - Strict organization boundary enforcement on all mutations and queries via composite foreign keys.
  - Employee role restricted to updating only assigned tasks' status and description.
  - Full CRUD operations audited.

---

### Phase 4: Pagination, Sorting, Caching & Query Optimization
- **Status**: Completed & verified in local development / integration test environment.
- **Scope**:
  - Server-side pagination (default 20, max 100) with deterministic sorting.
  - Redis cache-aside implementation for organization dashboard metrics and department lookups.
  - Safe cache key namespacing (`org:{orgId}:...`) and mutation invalidation via generation bumping.
  - Query optimization and evidence collection using `EXPLAIN ANALYZE`.
- **Verified Evidence**:
  - Invalid sort fields rejected by Zod validators.
  - Cache hit/miss/invalidation behaves deterministically.
  - Failover resilience: if Redis is unavailable, API serves uncached database results without crashing (`X-Cache: BYPASS`).

---

### Phase 5: Frontend & Interactive System
- **Status**: Completed & verified in local development / integration test environment (committed at `20dae0d1068bcaa2165dd7bf0af45bd5cd014456`).
- **Scope**:
  - React 19 + Vite 6 + TypeScript single-page application (`apps/web`).
  - Vanilla CSS design system with custom tokens, dark glassmorphism, responsive breakpoints, and `prefers-reduced-motion` media query compliance.
  - Short-lived access token kept in memory; refresh token in HttpOnly `SameSite=Strict` cookie.
  - Concurrency-safe single-flight 401 refresh queuing and retry.
  - Multi-tenant organization switcher requiring valid refresh cookie; updates in-memory token only after HTTP 200, refetches `/auth/me`, and persists across page reloads.
  - Live data only (zero shipped mock data or demo account shortcuts).
  - Member management workflow explicitly labeled "Add existing user".
  - Audit view explicitly labeled as "audit trail" (cloud/hardware immutable storage unverified/not implemented).
  - 13 Playwright Chromium browser E2E journeys covering:
    - 6 core user journeys (registration, KPI baseline, dept/project sync, project delete confirmation & task cascade, member assignment, tenant switch reload persistence, logout redirection).
    - 3 RBAC sessions (Manager project/task access and hidden admin tabs; Employee assigned task edit and denied mutation of unassigned tasks; Viewer read-only access and 403 API denials).
    - 4 resilience & accessibility scenarios (concurrent 401 refresh, keyboard Escape modal dismissal, 375x667 mobile rendering, reduced-motion animation clamping).
- **Verified Evidence**:
  - All 13 Playwright browser E2E tests pass.
  - Monorepo build and typecheck pass cleanly with zero errors.
  - Exact-ID test cleanup verified with 0 leftover test fixture records.

---

### Phase 6: Final Audit, Documentation & Delivery
- **Status**: In Progress — Final Audit & Documentation.
- **Scope**:
  - Comprehensive repository secret hygiene scan across tracked files and commit history.
  - Documentation synchronization across `Project 2/organization-management-system/README.md`, `docs/implementation-plan.md`, and master root `README.md`.
  - Explicit documentation of verified development/testing scope versus unverified production deployment and multi-container Docker Compose orchestration.
  - Monorepo regression gates: full build, TypeScript typecheck, 92 backend tests, 13 frontend browser journeys, and fixture cleanup verification.
  - Present staged diff and git status for review prior to commit.
- **Acceptance Criteria**:
  - Documentation accurately reflects committed codebase and verified capabilities.
  - Secret scan confirms zero committed credentials or live tokens.
  - Zero test fixture records linger in PostgreSQL.
  - All regression test suites pass with 100% success rate.
