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
| **Project 2** | **OrgSphere** | Secure full-stack organization management software featuring multi-tenancy, RBAC, department & employee lifecycle, projects, tasks, Redis caching, audit logging, and observability. | React, TypeScript, Tailwind CSS, Express, PostgreSQL, Prisma, Redis, Docker | **Planned / In Progress** |
| **Project 3** | *Reserved Placeholder* | Reserved for future FS 2 coursework requirements. | TBD | **Reserved** |
| **Capstone Project** | *Reserved Placeholder* | Reserved for future FS 2 coursework requirements. | TBD | **Reserved** |

---

## Local Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or v20 LTS recommended)
- [Git](https://git-scm.com/)
- [Docker & Docker Compose](https://www.docker.com/) (required for Project 2 services: PostgreSQL & Redis)

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

### Running Project 2 (OrgSphere — Planned)
Refer to the dedicated guide in [`Project 2/organization-management-system/README.md`](./Project%202/organization-management-system/README.md) for environment configuration and Docker Compose setup once implementation begins.

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
