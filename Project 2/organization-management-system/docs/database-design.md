# OrgSphere Database Design & Entity Relationships

## 1. Entity-Relationship Diagram (11 Entities)

```mermaid
erDiagram
    User ||--o{ OrganizationMembership : "holds"
    User ||--o{ RefreshToken : "owns"
    User ||--o{ AuditLog : "initiates"

    Organization ||--o{ OrganizationMembership : "contains"
    Organization ||--o{ Department : "manages"
    Organization ||--o{ Project : "owns"
    Organization ||--o{ Task : "tracks"
    Organization ||--o{ AuditLog : "records"
    Organization ||--o{ RefreshToken : "scopes"

    Role ||--o{ OrganizationMembership : "assigned to"
    Role ||--o{ RolePermission : "grants"
    Permission ||--o{ RolePermission : "defines"

    Department ||--o{ Project : "houses"
    Project ||--o{ Task : "contains"
    OrganizationMembership ||--o{ Project : "leads"
    OrganizationMembership ||--o{ Task : "assigned to"

    User {
        uuid id PK
        string email UK
        string passwordHash
        string firstName
        string lastName
        string phoneCiphertext
        string phoneIv
        string phoneTag
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }

    Organization {
        uuid id PK
        string name
        string slug UK
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }

    OrganizationMembership {
        uuid id PK
        uuid userId FK
        uuid organizationId FK
        uuid roleId FK
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }

    Role {
        uuid id PK
        string name UK
        string description
        boolean isSystemRole
        datetime createdAt
        datetime updatedAt
    }

    Permission {
        uuid id PK
        string action UK
        string description
        datetime createdAt
        datetime updatedAt
    }

    RolePermission {
        uuid id PK
        uuid roleId FK
        uuid permissionId FK
    }

    Department {
        uuid id PK
        string name
        uuid organizationId FK
        datetime createdAt
        datetime updatedAt
    }

    Project {
        uuid id PK
        string name
        string description
        string status
        datetime startDate
        datetime endDate
        uuid organizationId FK
        uuid departmentId FK
        uuid ownerId FK
        datetime createdAt
        datetime updatedAt
    }

    Task {
        uuid id PK
        string title
        string description
        string priority
        string status
        datetime dueDate
        uuid organizationId FK
        uuid projectId FK
        uuid assigneeId FK
        datetime createdAt
        datetime updatedAt
    }

    RefreshToken {
        uuid id PK
        string tokenHash UK
        uuid userId FK
        uuid organizationId FK
        datetime expiresAt
        datetime revokedAt
        datetime createdAt
    }

    AuditLog {
        uuid id PK
        uuid organizationId FK
        uuid actorId FK
        string action
        string resourceType
        string resourceId
        string ipAddress
        string requestId
        json metadata
        datetime createdAt
    }
```

---

## 2. Multi-Tenant Integrity & Composite Foreign Keys

To guarantee that entities from one organization cannot accidentally link to another organization's records, PostgreSQL composite foreign keys enforce organization isolation directly at the database engine level:

### Enforced at Database Engine Level
1. **Department Isolation**:
   - `Department` has `@@unique([id, organizationId])`.
   - `Project` references `(departmentId, organizationId)` pointing to `Department(id, organizationId)`.
   - *Result*: A project in Org A cannot reference a department in Org B; PostgreSQL raises a foreign key violation `23503`.
2. **Project Isolation**:
   - `Project` has `@@unique([id, organizationId])`.
   - `Task` references `(projectId, organizationId)` pointing to `Project(id, organizationId)`.
   - *Result*: A task in Org A cannot be assigned to a project in Org B.
3. **Membership Ownership & Assignment Isolation**:
   - `OrganizationMembership` has `@@unique([userId, organizationId])`.
   - `Project` references `(ownerId, organizationId)` pointing to `OrganizationMembership(userId, organizationId)`.
   - `Task` references `(assigneeId, organizationId)` pointing to `OrganizationMembership(userId, organizationId)`.
   - *Result*: When non-null, an assignee or project owner must belong to that specific organization.
4. **Refresh Token Tenant Binding**:
   - `RefreshToken` references `(userId, organizationId)` pointing to `OrganizationMembership(userId, organizationId)` with `ON DELETE CASCADE`.
   - *Result*: A refresh token can only be issued for a user who holds an active membership in that organization. If the membership is deleted, the token is automatically purged.
5. **Audit Log Retention Policy (`ON DELETE RESTRICT`)**:
   - `AuditLog` references `Organization(id)` with `ON DELETE RESTRICT`.
   - *Result*: Protects audit logs from being removed by deleting their parent organization while referencing logs exist; PostgreSQL rejects hard-deletion attempts with a foreign key violation (`P2003`). Organizations must instead be deactivated via soft-delete (`isActive = false`) to retain historical audit rows. (Note: database constraints protect against cascading parent deletions; append-only enforcement and log immutability are handled separately by service-layer access controls).

### Nullable Composite Foreign Keys Semantics
- Under PostgreSQL default foreign key rules (`MATCH SIMPLE`), if a nullable component (`departmentId`, `ownerId`, or `assigneeId`) is `NULL`, the constraint is satisfied.
- This accurately models optional relationships: a project may be created before a department is assigned, and a task may initially be unassigned.
- **Guarantee**: Whenever `departmentId`, `ownerId`, or `assigneeId` is non-null, PostgreSQL strictly enforces that the referenced entity shares the exact same `organizationId`.

### Enforced at Service Layer
- Application service layer queries inject `where: { organizationId }` on all operations.
- Route authorization verifies the user's active membership in the requested organization before processing requests.
- Soft non-enumeration policy: If a resource belongs to another organization, return `404 Not Found` rather than revealing its existence.

---

## 3. Indexing Strategy

Indexes are designed following the **leading-column rule** to optimize multi-tenant queries:

| Table | Index Columns | Supported Query Patterns |
|---|---|---|
| `OrganizationMembership` | `[userId, organizationId]` (Unique) | User tenant lookup, membership verification |
| `OrganizationMembership` | `[organizationId, roleId]` | List members filtered by role within an org |
| `Department` | `[organizationId, name]` (Unique) | Prevent duplicate department names within an org |
| `Project` | `[organizationId, status]` | Org project listing filtered by status |
| `Project` | `[organizationId, createdAt]` | Chronological project pagination |
| `Project` | `[departmentId]` | Projects in department lookup |
| `Task` | `[organizationId, status]` | Filter tasks by status within an org |
| `Task` | `[projectId, status]` | Task board / Kanban view within a project |
| `Task` | `[assigneeId, status]` | My assigned tasks list |
| `Task` | `[organizationId, dueDate]` | Overdue task calculations |
| `AuditLog` | `[organizationId, createdAt]` | Chronological audit log pagination |
| `AuditLog` | `[organizationId, action]` | Audit filtering by event type |
| `RefreshToken` | `[userId, organizationId]` | Token revocation on logout / password reset |

---

## 4. Container Initialization vs. Migration Lifecycle

> [!IMPORTANT]
> **Container Initialization Note**:
> PostgreSQL container initialization scripts located in `infra/postgres-init/` execute **only once**, during the initial creation of an empty database volume.
> If the data directory already contains initialized database files, these scripts are skipped by PostgreSQL.
>
> All subsequent schema modifications and evolutions **must be executed via Prisma migrations**:
> ```bash
> npx prisma migrate dev --name <migration_name>
> ```
