# Social Composer — Full-Stack Project

A production-ready social media post composer with JWT authentication, Cloudinary media uploads, and bulk post management.

## Architecture

```
FS_2_Project-1_Post_Composer/
├── social-composer-backend/    # Node.js + Express + MongoDB (→ Render)
├── social-composer-frontend/   # React + Vite              (→ Vercel)
└── START.bat                   # One-click local dev launcher
```

## Tech Stack

| Layer | Technology | Hosting |
|---|---|---|
| Frontend | React 18 + Vite + React Router v6 | Vercel |
| Backend | Node.js + Express.js | Render |
| Database | MongoDB (Mongoose) | MongoDB Atlas |
| Media Storage | Cloudinary | Cloudinary (free tier) |
| Auth | JWT + bcrypt | — |

## Quick Start (Local)

1. Clone the repo
2. Fill in `social-composer-backend/.env` (see backend README)
3. Double-click `START.bat`

## Deployment

See individual READMEs:
- [`social-composer-backend/README.md`](./social-composer-backend/README.md) — Render deploy guide
- [`social-composer-frontend/README.md`](./social-composer-frontend/README.md) — Vercel deploy guide
