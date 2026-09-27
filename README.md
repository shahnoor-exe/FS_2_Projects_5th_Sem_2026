# FS 2 Projects — 5th Semester 2026

Welcome to the master repository and portfolio guide for the Full-Stack 2 (FS 2) coursework for 5th Semester 2026. This repository organizes and tracks all laboratory projects and the final capstone project.

---

## Repository Structure

```text
FS_2_Projects_5th_Sem_2026/
├── README.md                                    # Master portfolio guide
├── .gitignore                                   # Global repository ignore rules
├── Project 1/
│   └── post-composer/                           # Social Composer full-stack application
│       ├── social-composer-backend/             # Node.js + Express + MongoDB Atlas API
│       ├── social-composer-frontend/            # React 18 + Vite + Tailwind CSS SPA
│       ├── START.bat                            # Windows one-click local development launcher
│       ├── README.md                            # Post Composer documentation & deployment guide
│       └── .gitignore                           # Post Composer specific ignore rules
├── Project 2/
│   └── organization-management-system/          # OrgSphere — Organization Management System
│       └── README.md                            # Project 2 specification & roadmap
├── Project 3/
│   └── README.md                                # Reserved placeholder for future coursework
└── Capstone Project/
    └── README.md                                # Reserved placeholder for future coursework
```

---

## Project Overview

| Project | Title | Description | Tech Stack | Status |
|---|---|---|---|---|
| **Project 1** | **Social Composer** | Production-ready social media post composer with JWT authentication, Cloudinary media uploads, bulk post management, calendar view, admin dashboard, user management, and audit logs. | React 18, Vite, Node.js, Express, MongoDB Atlas, Cloudinary | **Completed** |
| **Project 2** | **OrgSphere** | Multi-tenant organization management software with RBAC, department & project workflows, task assignment, rotating refresh sessions, audit trail, and responsive glassmorphic UI. | React 19, TypeScript, Vanilla CSS, Node.js, Express, PostgreSQL 16, Prisma, Redis 7, Docker | **Implemented & Verified (Development)** |
| **Project 3** | *Reserved Placeholder* | Reserved for future FS 2 coursework requirements. | TBD | **Reserved** |
| **Capstone Project** | *Reserved Placeholder* | Reserved for future FS 2 coursework requirements. | TBD | **Reserved** |

---

## Local Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+ recommended; v24 tested)
- [Git](https://git-scm.com/)
- [Docker & Docker Compose](https://www.docker.com/) (required for Project 2 services: PostgreSQL on port 5433 host, Redis on port 6379 host)

### Running Project 1 (Social Composer)
1. Navigate to `Project 1/post-composer/`.
2. Configure environment files:
   - Backend: Create `social-composer-backend/.env` (see `social-composer-backend/README.md` for required keys: `MONGO_URI`, `JWT_SECRET`, Cloudinary keys).
   - Frontend: Create `social-composer-frontend/.env` with `VITE_API_URL`.
3. Launch development servers:
   - **Windows**: Double-click `START.bat` or run:
     ```cmd
     cd "Project 1/post-composer"
     START.bat
     ```
   - **Manual**:
     ```bash
     cd "Project 1/post-composer/social-composer-backend" && npm install && npm run dev
     cd "Project 1/post-composer/social-composer-frontend" && npm install && npm run dev
     ```

### Running Project 2 (OrgSphere)
Refer to the comprehensive specification in [`Project 2/organization-management-system/README.md`](./Project%202/organization-management-system/README.md).

1. Navigate to `Project 2/organization-management-system/`:
   ```bash
   cd "Project 2/organization-management-system"
   ```
2. Configure environment template:
   ```bash
   cp .env.example .env
   ```
3. Install dependencies and generate database client:
   ```bash
   npm install
   npm run prisma:generate
   ```
4. Start containerized PostgreSQL (port 5433 host) and Redis (port 6379 host):
   ```bash
   docker compose up -d postgres redis
   npm run prisma:migrate
   ```
5. Launch development services:
   - API server (port 4000): `npm run dev:api`
   - Frontend SPA (port 3000): `npm run dev:web`
6. Run verified automated test suites:
   - Backend integration tests (92 tests): `npm test --workspace=@orgsphere/api`
   - Frontend browser E2E journeys (13 tests): `npm run test:e2e --workspace=@orgsphere/web`

> *Note on Verification Scope*: Project 2 has been verified in local development with live PostgreSQL and Redis backing containers, passing 105 automated tests. Multi-container Docker Compose build/orchestration for application containers (`api` and `web`) simultaneously and cloud production deployments remain unverified.

---

## Contribution & Git Workflow

- **Branching Strategy**:
  - `main`: Production-ready code and verified milestones.
  - `feature/<name>` or `feat/<project>-<feature>`: Feature branches for active development.
- **Commit Message Convention**:
  - Follow Conventional Commits:
    - `feat(<scope>): <description>`
    - `fix(<scope>): <description>`
    - `docs(<scope>): <description>`
    - `chore(<scope>): <description>`
- **Security & Hygiene**:
  - Never commit `.env` files, secrets, database credentials, or private keys.
  - Keep root `.gitignore` updated for all workspace dependencies and build outputs.
