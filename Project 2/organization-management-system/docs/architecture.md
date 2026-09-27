# OrgSphere Architecture & System Design

## 1. System Overview
OrgSphere is a secure multi-organization workspace application designed for managing organizations, departments, employees, projects, tasks, and audit logs with strict role-based access control (RBAC).

```mermaid
flowchart TD
    Client["Client Applications (React SPA / Mobile / External API)"]

    subgraph Edge ["Edge & Ingress"]
        LB["Reverse Proxy / Nginx / Docker Network"]
    end

    subgraph AppServer ["Express Application Server (Node.js + TypeScript)"]
        ReqId["Request Correlation ID Middleware"]
        PinoLog["Pino Structured HTTP Logger"]
        CorsHelmet["Helmet & CORS Security"]
        RateLimiter["Rate Limiting Middleware"]
        AuthMiddleware["Authentication Middleware (JWT Access Token)"]
        OrgContext["Organization Context & Isolation Middleware"]
        RBAC["RBAC Middleware (requireRole / requirePermission)"]

        Router["API Router (/api/v1)"]

        subgraph Modules ["Business Modules"]
            HealthMod["Health & Ready Module"]
            AuthMod["Auth Module"]
            OrgMod["Organizations Module"]
            UserMod["Users & Membership Module"]
            DeptMod["Departments Module"]
            ProjMod["Projects Module"]
            TaskMod["Tasks Module"]
            AuditMod["Audit Logs Module"]
        end

        ErrorHandler["Centralized Global Error Handler"]
    end

    subgraph DataTier ["Persistence & Caching"]
        Prisma["Prisma ORM Client"]
        Postgres[("PostgreSQL 16\n(Multi-tenant Relational DB)")]
        RedisClient["ioredis Client"]
        RedisCache[("Redis 7\n(Dashboard Metrics & Lookups)")]
    end

    Client -->|HTTPS / REST| LB
    LB --> ReqId
    ReqId --> PinoLog --> CorsHelmet --> RateLimiter --> AuthMiddleware
    AuthMiddleware --> OrgContext --> RBAC --> Router
    Router --> Modules
    Modules --> Prisma --> Postgres
    Modules --> RedisClient --> RedisCache
    Modules -.->|Errors| ErrorHandler
    ErrorHandler -->|Standard Envelope| Client
```

---

## 2. Module Responsibilities

| Module | Core Responsibility |
|---|---|
| **Health & Readiness** | System liveness (`/health`), readiness dependency probes (`/ready`), and version info (`/version`). |
| **Auth** | User registration, login, logout, refresh token rotation, password change/reset. |
| **Organizations** | Multi-organization lifecycle, tenant settings, active organization selection. |
| **Users & Memberships** | User profile management, organization memberships, and role assignments. |
| **Departments** | Department hierarchies and organizational resource grouping. |
| **Projects** | Project tracking, status workflows, and department ownership. |
| **Tasks** | Task assignments, status, priority, due dates, and employee task updates. |
| **Audit Logs** | Immutable, append-only security logs capturing actor, action, tenant, IP, and correlation ID. |

---

## 3. Request Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor User as Client
    participant MW as Middleware Chain
    participant Ctrl as Controller
    participant Svc as Service Layer
    participant Repo as Repository / Prisma
    participant DB as PostgreSQL
    participant Redis as Redis Cache

    User->>MW: HTTP Request + x-request-id + Bearer Token
    MW->>MW: Attach/Generate Correlation ID
    MW->>MW: Authenticate JWT (extract userId, memberships)
    MW->>MW: Validate Organization Context (Header / Route Param)
    MW->>MW: Enforce RBAC (verify role/permissions in active org)
    MW->>Ctrl: Dispatch to Module Controller
    Ctrl->>Ctrl: Validate Request Payload with Zod
    Ctrl->>Svc: Invoke Service Operation (orgId, actor, input)
    alt Cacheable Read
        Svc->>Redis: Check Cache Key (scoped by orgId)
        alt Cache Hit
            Redis-->>Svc: Return Cached JSON
        else Cache Miss
            Svc->>Repo: Query Database
            Repo->>DB: Execute Scoped Query (WHERE organization_id = $1)
            DB-->>Repo: Return Rows
            Repo-->>Svc: Return Domain Models
            Svc->>Redis: Store in Cache with TTL
        end
    else Mutation
        Svc->>Repo: Perform Insert / Update (composite org check)
        Repo->>DB: Execute Mutation
        DB-->>Repo: Acknowledge
        Svc->>Redis: Invalidate Org Cache Keys
        Svc->>Repo: Record Audit Log Entry
    end
    Svc-->>Ctrl: Service Result
    Ctrl-->>User: 200 OK { success: true, data: ..., meta: ... }
```

---

## 4. Cross-Organization Boundary Enforcement

Data security between organizations is guaranteed at two distinct layers:

### A. Database-Enforced Composite Foreign Keys
The PostgreSQL schema uses composite unique constraints and composite foreign keys to guarantee relational integrity across organizational boundaries:
- `Department` has `@@unique([id, organizationId])`.
- `Project` references `Department` via composite foreign key `(departmentId, organizationId) -> Department(id, organizationId)`. This makes it **physically impossible** for a project in Organization A to be assigned to a department in Organization B.
- `Project` has `@@unique([id, organizationId])`.
- `Task` references `Project` via composite foreign key `(projectId, organizationId) -> Project(id, organizationId)`. This makes it **physically impossible** for a task in Organization A to belong to a project in Organization B.
- `Task` references `OrganizationMembership` via composite foreign key `(assigneeId, organizationId) -> OrganizationMembership(userId, organizationId)`. An assignee must be a verified member of that exact organization.

### B. Service-Layer Ownership & Organization Scoping
- Every data access repository explicitly injects `where: { organizationId }` into queries.
- Before updating or deleting entities, services verify entity existence strictly within the requesting tenant context.
- Cross-organization access attempts return `404 Not Found` (to prevent tenant enumeration attacks) or `403 Forbidden` according to security policy.
