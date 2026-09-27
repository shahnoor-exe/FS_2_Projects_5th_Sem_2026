# OrgSphere — Organization Management System

## Status & Verification Scope
- **Implementation Status**: Phases 1 through 5 implemented and verified against the committed contract (`20dae0d1068bcaa2165dd7bf0af45bd5cd014456`).
- **Verified Environment**: Local development and integration test environment (Live Express API on port 4000, Vite React SPA on port 3000, PostgreSQL container on port 5433 host / 5432 container, Redis container on port 6379 host).
- **Test Suite Results**: 105 automated tests passing:
  - **92 Backend Integration Tests** (`vitest` in `@orgsphere/api`): Multi-tenant isolation, composite FK enforcement, Argon2id security, token family rotation with 5s duplicate window, 3-tier immediate deactivation, sole-admin protection, rate limiting, and Redis cache-aside fallback.
  - **13 Frontend Browser E2E Journeys** (`playwright` Chromium in `@orgsphere/web`): Core admin workflows, department/project synchronization, task creation and project deletion with confirmation & cascade, member assignment ("Add existing user"), tenant switcher with reload persistence, manager/employee/viewer sessions with permission guardrails and 403 denials, concurrent 401 refresh queuing, keyboard Escape dismissal, 375x667 mobile rendering, and `prefers-reduced-motion` animation clamping.
- **Unverified / Delivery Limitations**: Full multi-container Docker Compose build/orchestration for `api` and `web` containers simultaneously (`docker compose up` for application containers) and production cloud deployment remain unverified.

---

## Architecture Overview

```mermaid
flowchart LR
    subgraph Clients
        Web["React + Vite SPA\n(:3000)\nIn-Memory Access Token\nHttpOnly Refresh Cookie"]
    end

    subgraph Backend
        API["Express API Server\n(:4000)\nArgon2id + AES-256-GCM\nStructured Pino Logging\nOpenTelemetry Tracing"]
    end

    subgraph Services
        Postgres[("PostgreSQL 16\n(Port 5433 host / 5432 container)\nComposite FK Isolation\nPrisma ORM")]
        Redis[("Redis 7 Cache\n(:6379)\nCache-Aside & Invalidation\nRate Limiting")]
    end

    Web -->|REST /api/v1 (credentials: include)| API
    API -->|Prisma Client| Postgres
    API -->|ioredis| Redis
```

Detailed design and specification documents are located in [`docs/`](./docs/):
- [`docs/architecture.md`](./docs/architecture.md) — System diagram, module responsibilities, request lifecycle, tenant boundaries.
- [`docs/api-contract.md`](./docs/api-contract.md) — REST conventions, standard envelopes, status codes, dependency policies.
- [`docs/database-design.md`](./docs/database-design.md) — Complete ER diagram covering all 11 entities, composite foreign keys, indexing strategy.
- [`docs/security.md`](./docs/security.md) — Password hashing, JWT access/rotating refresh tokens, RBAC matrix, AES-256-GCM encryption.
- [`docs/implementation-plan.md`](./docs/implementation-plan.md) — Phase-by-phase completion roadmap and acceptance criteria.

---

## Tech Stack

| Layer | Technology | Role |
|---|---|---|
| **Frontend** | React 19, Vite 6, TypeScript | Single-page application (`apps/web`) with in-memory token storage |
| **Styling** | Vanilla CSS Design System | Curated dark glassmorphic palette, CSS variables, micro-animations, and `prefers-reduced-motion` compliance |
| **Backend** | Node.js, Express, TypeScript | REST API (`apps/api`) with correlation IDs & standardized response envelope |
| **Database** | PostgreSQL 16, Prisma ORM | Relational multi-tenant persistence with engine-level composite foreign key constraints |
| **Cache & Limiting** | Redis 7 (`ioredis`) | Cache-aside for metrics, cache invalidation on mutations, failover resilience, rate limiting |
| **Security** | Argon2id, AES-256-GCM, Crypto | Secure password hashing, PII encryption (phone numbers), cryptographically hashed rotating refresh tokens |
| **Validation** | Zod | Runtime payload, query, and environment validation via `@orgsphere/shared` |
| **Observability** | Pino, OpenTelemetry (HTTP OTLP) | Structured logging with request correlation IDs & distributed tracing |
| **Documentation** | Swagger UI / OpenAPI 3.0 | Interactive API contract served at `/api/v1/docs` |
| **Containers** | Docker, Docker Compose | Containerized PostgreSQL and Redis backing services |

---

## Role-Based Access Control (RBAC) Specification

The system implements 4 tenant roles with strict, engine-enforced and API-enforced guardrails:

| Role | Permissions | UI Capabilities & Restrictions |
|---|---|---|
| **ORG_ADMIN** | `org:manage`, `org:read`, `dept:manage`, `dept:read`, `member:manage`, `member:read`, `project:manage`, `project:read`, `task:manage`, `task:read`, `task:update_assigned`, `audit:read` | Full governance: manage organization, create/edit/delete departments, manage projects (with cascade task delete), add existing users as members, view audit trail, and access tenant settings. |
| **MANAGER** | `org:read`, `dept:read`, `member:read`, `project:manage`, `project:read`, `task:manage`, `task:read`, `task:update_assigned` | Full project and task lifecycle management. Read-only visibility for departments and members (cannot create or modify departments). Administrative views (Audit Logs, Organization Settings) are omitted from navigation. |
| **EMPLOYEE** | `org:read`, `dept:read`, `member:read`, `project:read`, `task:read`, `task:update_assigned` | View departments, members, projects, and tasks. Restricted mutation: can update **status** and **description** on explicitly assigned tasks only; title, priority, project, and assignee fields are immutable. Creation and deletion controls omitted; direct mutations on unassigned tasks rejected with `403 Forbidden`. |
| **VIEWER** | `org:read`, `dept:read`, `member:read`, `project:read`, `task:read` | Complete read-only access across the organization. All creation, editing, and deletion buttons are omitted from the DOM; state-changing API requests rejected with `403 Forbidden`. |

---

## Multi-Tenant Integrity Guarantees

Cross-tenant leakage is prevented at the database engine level using composite foreign keys:
- Projects can only reference Departments in the same organization: `(departmentId, organizationId) -> Department(id, organizationId)`.
- Project owners must belong to the same organization: `(ownerId, organizationId) -> OrganizationMembership(userId, organizationId)`.
- Tasks can only belong to Projects in the same organization: `(projectId, organizationId) -> Project(id, organizationId)`.
- Task assignees must belong to the same organization: `(assigneeId, organizationId) -> OrganizationMembership(userId, organizationId)`.

---

## Local Setup & Development

### 1. Prerequisites
- **Node.js** (v20+ recommended; v24 tested)
- **npm** (v10+; v11 tested)
- **Docker & Docker Compose** (for containerized PostgreSQL and Redis)

### 2. Environment Configuration
Copy the template to `.env`:
```bash
cp .env.example .env
```

#### Port Assignment & Database Notes:
- **Docker Compose PostgreSQL**: Bound to host port `5433` (e.g. `localhost:5433`) to prevent collision with any existing local PostgreSQL service running on port `5432`.
- **Docker Compose Redis**: Bound to host port `6379`.
- **API Server**: Runs on port `4000`.
- **Frontend SPA**: Runs on port `3000` (Vite dev server with `/api` proxy).

### 3. Install Dependencies
From `Project 2/organization-management-system`:
```bash
npm install
```

### 4. Database Setup & Prisma
```bash
# Validate schema
npm run prisma:validate

# Generate Prisma client
npm run prisma:generate

# Apply migrations
npm run prisma:migrate
```

### 5. Running the Application in Development
- **Start Backing Services (PostgreSQL & Redis)**:
  ```bash
  docker compose up -d postgres redis
  ```
- **Run API Server**:
  ```bash
  npm run dev:api
  ```
- **Run Frontend SPA**:
  ```bash
  npm run dev:web
  ```

---

## Available Monorepo Scripts

| Command | Action |
|---|---|
| `npm run build` | Build all workspaces (`@orgsphere/shared`, `@orgsphere/api`, `@orgsphere/web`). |
| `npm run typecheck` | Run TypeScript compiler typechecks across all workspaces (`tsc --noEmit`). |
| `npm test --workspace=@orgsphere/api` | Run the complete 92-test backend integration suite. |
| `npm run test:e2e --workspace=@orgsphere/web` | Run the complete 13-test browser E2E suite via Playwright. |
| `npm run dev:api` | Start the Express API development server with live reload. |
| `npm run dev:web` | Start the Vite React development server. |
| `npm run prisma:generate` | Generate the Prisma client. |
| `npm run prisma:validate` | Validate `schema.prisma` syntax and relation constraints. |
| `npm run prisma:migrate` | Apply Prisma database migrations. |
