# OrgSphere Implementation Plan & Acceptance Criteria

## Phase Breakdown

### Phase 1: Architecture & Backend Foundation
- **Status**: Implementation complete; database and Compose runtime verification pending
- **Scope**:
  - Monorepo directory structure setup with npm workspaces.
  - Complete documentation suite (`architecture.md`, `api-contract.md`, `database-design.md`, `security.md`, `implementation-plan.md`).
  - Docker Compose service definition (`postgres` on 5433 host, `redis` on 6379, `api` on 4000, `web` on 3000).
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
- **Acceptance Criteria**:
  - `npm run typecheck` passes with zero TypeScript errors.
  - `npx prisma validate` passes with zero schema errors.
  - Health and version endpoints return 200 OK with expected JSON envelope.
  - Readiness probe properly verifies database and provides graceful Redis status.
  - OpenAPI 3.0 documentation loads cleanly at `/api/v1/docs`.

---

### Phase 2: Authentication, RBAC, Encryption & Audit Logging
- **Scope**:
  - Registration with automatic organization creation.
  - Login, logout, and token refresh with rotating refresh tokens in HttpOnly cookies.
  - Storing only hashed refresh tokens in the database.
  - Role-based access control (Super Admin, Org Admin, Manager, Employee, Viewer) with permission checks.
  - AES-256-GCM encryption for phone numbers and sensitive PII.
  - Immutable audit logging for mutations and auth events.
  - Seed script for development test accounts.
- **Acceptance Criteria**:
  - Unauthenticated requests return 401.
  - Insufficient role requests return 403.
  - Cross-organization resource access returns 404.
  - Rotating refresh token revokes previous token upon use.
  - Sensitive fields properly encrypted in database.

---

### Phase 3: Core Organization Management APIs
- **Scope**:
  - RESTful CRUD modules for Organizations, Departments, Users/Memberships, Projects, and Tasks.
  - Department reassignment/deletion guards.
  - Project status workflows and ownership assignment.
  - Task assignment workflows with employee self-update restrictions.
  - Complete integration test suite across two isolated test organizations.
- **Acceptance Criteria**:
  - Strict organization boundary enforcement on all mutations and queries.
  - Employee role restricted to updating only assigned tasks.
  - Full CRUD operations audited.

---

### Phase 4: Pagination, Sorting, Caching & Query Optimization
- **Scope**:
  - Server-side pagination (default 20, max 100) with deterministic sorting.
  - Redis cache-aside implementation for organization dashboard metrics and department lookups.
  - Safe cache key namespacing (`org:{orgId}:...`) and mutation invalidation.
  - Query optimization and evidence collection using `EXPLAIN ANALYZE`.
- **Acceptance Criteria**:
  - Invalid sort fields rejected by Zod validators.
  - Cache hit/miss/invalidation behaves deterministically.
  - If Redis is down, API serves uncached database results without crashing.

---

### Phase 5: Frontend & Live Demo
- **Scope**:
  - React + Vite + TypeScript single-page application with Tailwind CSS.
  - Role-aware navigation and responsive layout.
  - React Query for server state and caching.
  - React Hook Form + Zod for forms.
  - Live interactive demo workflow covering Admin, Manager, and Employee journeys.
- **Acceptance Criteria**:
  - Accessible, responsive UI at mobile, tablet, and desktop viewports.
  - Clean error states, loading skeletons, and toast feedback.
  - Zero secrets or private keys exposed in client bundles.

---

### Phase 6: Final Audit, Documentation & Delivery
- **Scope**:
  - Comprehensive workspace security scan (zero committed `.env` files or credentials).
  - Validation of both Project 1 (Social Composer) and Project 2 (OrgSphere).
  - Ready for final commit and push review.
