# Social Composer — Backend

Node.js / Express REST API for the Social Composer application.

## Tech Stack
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB via Mongoose (hosted on MongoDB Atlas)
- **Auth**: JSON Web Tokens (JWT) + bcrypt
- **Media**: Multer + Cloudinary (no local disk storage)

## Project Structure
```
social-composer-backend/
├── server.js              # Entry point
├── .env                   # Secrets (not committed)
├── /middlewares
│   ├── auth.js            # JWT verification
│   └── upload.js          # Multer + Cloudinary streaming
├── /models
│   ├── User.js            # Mongoose user schema
│   └── Post.js            # Mongoose post schema
└── /routes
    ├── authRoutes.js      # POST /api/auth/register, /login
    └── postRoutes.js      # GET/POST /api/posts, DELETE /api/posts/bulk
```

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
Edit `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `MONGO_URI` | MongoDB Atlas → Connect → Drivers |
| `JWT_SECRET` | Any long random string |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary Dashboard |
| `CLOUDINARY_API_KEY` | Cloudinary Dashboard |
| `CLOUDINARY_API_SECRET` | Cloudinary Dashboard |
| `CLIENT_URL` | `http://localhost:5173` (dev) or your Vercel URL (prod) |

### 3. Run locally
```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

Server starts at `http://localhost:5000`.

---

## API Reference

### Auth

| Method | Endpoint | Body | Returns |
|---|---|---|---|
| POST | `/api/auth/register` | `{ username, password }` | `{ token, user }` |
| POST | `/api/auth/login` | `{ username, password }` | `{ token, user }` |

### Posts *(all require `Authorization: Bearer <token>` header)*

| Method | Endpoint | Body | Returns |
|---|---|---|---|
| GET | `/api/posts` | — | Array of posts |
| POST | `/api/posts` | FormData: `title`, `description`, `status`, `platforms` (JSON string), `media` (file) | Created post |
| DELETE | `/api/posts/bulk` | `{ ids: ["id1","id2"] }` | `{ deletedCount }` |

---

## Deploying to Render

1. Push this folder to a GitHub repository.
2. In Render: **New → Web Service** → connect the repo.
3. Set:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. Add all environment variables from `.env` in the **Environment** tab.
5. After your frontend is live on Vercel, update `CLIENT_URL` to your Vercel URL and redeploy.

> **Cold Starts**: Render's free tier sleeps after inactivity. The first request after downtime may take 30–50 s. The frontend shows a spinner to handle this gracefully.
