# OrgSphere Security Architecture & Threat Model

## 1. Password Hashing Policy
- **Primary Algorithm**: Argon2id (`v=19`, `m=65536`, `t=3`, `p=4`).
- **Compatibility Fallback**: `bcryptjs` / `bcrypt` with cost factor 12 if native Argon2id bindings are unavailable in the host execution environment.
- **Rules**:
  - Passwords are **never encrypted**; they are strictly **one-way salted and hashed**.
  - Password hashes are **never returned** in any API response or logged in any format.

---

## 2. JWT & Token Management Model

### Access Token
- **Format**: Signed JSON Web Token (JWT).
- **Lifespan**: Short-lived (15 minutes).
- **Payload**:
  ```json
  {
    "sub": "user-uuid",
    "org": "organization-uuid",
    "role": "ORG_ADMIN",
    "type": "access",
    "iat": 1727440000,
    "exp": 1727440900
  }
  ```
- **Validation**: Strict verification of signature, issuer, audience, expiration, and token type.

### Rotating Refresh Token
- **Lifespan**: 7 days.
- **Storage**:
  - Sent to the client in an `HttpOnly`, `SameSite=Strict`, `Secure` (production) cookie.
  - **Database Storage**: Only a cryptographically secure hash (`SHA-256`) of the refresh token is stored in the `RefreshToken` table in PostgreSQL.
- **Organization Membership Binding**:
  - Bound by composite foreign key `(userId, organizationId) -> OrganizationMembership(userId, organizationId)` with `ON DELETE CASCADE`.
  - Guarantees at the database level that a token cannot be generated or retained for a tenant the user does not belong to.
- **Token Rotation**:
  - Each invocation of `/api/v1/auth/refresh` revokes the old refresh token record (`revokedAt = NOW()`) and issues a brand-new access token + refresh token pair.
  - Re-use detection: If a revoked refresh token is presented, all refresh tokens associated with that user and organization are immediately revoked.
- **Revocation**:
  - Logout, membership removal, and password changes immediately invalidate active refresh token records.

### Organization Switching & Session Scope
- **Endpoint**: `POST /api/v1/auth/switch-org`
- **Session Credentials & CSRF Protection**:
  - Requires an authenticated Bearer token and possession of the active `HttpOnly` refresh cookie.
  - Enforces unconditional CSRF validation (`x-orgsphere-client` header and origin/referer verification).
  - Rotates the presented refresh token (`revokedAt = NOW()`, `revocationReason = 'ORG_SWITCH'`) and issues a target-tenant refresh token within a serialized database transaction (`SELECT ... FOR UPDATE`).
  - Sets the new target-tenant refresh cookie (`SameSite=Strict`, `HttpOnly`, `Path=/api/v1/auth`) and returns the target access token in JSON.
- **Architectural Scope & Access Token Limitation**:
  - Rotating this presented token prevents further refresh through that token/session family. It does not prevent Org A token issuance through some other independently valid session the user may hold.
  - **Limitation**: Any previously issued Org A Bearer access token remains cryptographically valid until its 15-minute expiry (`exp`), subject to the backend's live active-membership checks (`requireOrgContext` PostgreSQL verification).
  - The client application (browser) is responsible for discarding the old Org A access token from memory upon a successful switch; the server does not claim that stateless access tokens are instantly revoked.

---

## 3. Role-Based Access Control (RBAC) Matrix

| Permission | Super Admin | Org Admin | Manager | Employee | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| **Platform Management** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Manage Organization Details** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Manage Members & Roles** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Manage Departments** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Manage Projects** | ✅ | ✅ | ✅ (Assigned) | ❌ | ❌ |
| **Manage Tasks** | ✅ | ✅ | ✅ (Assigned) | ❌ | ❌ |
| **Update Own Tasks** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Read Org Data** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **View Audit Logs** | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 4. Sensitive Field Encryption (AES-256-GCM)

- **Target Fields**: Selected personal identifiable information (PII) such as phone numbers and physical addresses.
- **Algorithm**: `AES-256-GCM` (authenticated encryption).
- **Components Stored**:
  - `phoneCiphertext`: Base64-encoded encrypted data.
  - `phoneIv`: 12-byte initialization vector (unique per encryption event).
  - `phoneTag`: 16-byte authentication tag ensuring integrity and preventing tampering.
- **Key Management**:
  - 256-bit key provided via `ENCRYPTION_KEY` environment variable.
  - Validated on application startup for exact 32-byte (64 hex characters) length.
- **Strict Boundary**: The encryption utility is **never used** for passwords, JWT secrets, or tokens.

---

## 5. Threat Model & Mitigations

| Threat | Potential Vulnerability | Mitigation in OrgSphere |
|---|---|---|
| **Cross-Tenant Data Leakage** | User from Org A accessing Org B resources. | Enforced by PostgreSQL composite foreign keys (`[id, organizationId]`) and mandatory service-layer scoping. Returns 404 to prevent ID enumeration. |
| **Credential Stuffing / Brute Force** | Rapid login attempts. | Rate limiting via `express-rate-limit` on auth endpoints (`/login`, `/register`, `/change-password`). |
| **Token Theft / XSS** | JavaScript theft of authentication tokens. | Refresh tokens stored in `HttpOnly` cookies inaccessible to document scripts. Access tokens short-lived (15 min). |
| **Log Leakage** | Sensitive credentials leaking in logs. | Pino structured logger configured with automatic redaction of `password`, `token`, `cookie`, `authorization`, and PII fields. |
| **SQL Injection** | Dynamic queries manipulating database. | All database interactions execute parameterized queries via Prisma ORM. |
