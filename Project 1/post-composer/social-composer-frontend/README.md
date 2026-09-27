# Social Composer — Frontend

React + Vite frontend for the Social Composer application.

## Tech Stack
- **Framework**: React 18 + Vite
- **Routing**: React Router v6
- **HTTP**: Fetch API (native)
- **Auth**: JWT stored in localStorage
- **Styling**: Vanilla CSS with custom design system

## Project Structure
```
social-composer-frontend/
├── .env                        # VITE_API_URL
├── vite.config.js
├── /public
└── /src
    ├── main.jsx                # Entry — wraps App in AuthProvider
    ├── App.jsx                 # React Router: /login, /, /compose
    ├── index.css               # Global design system (dark glassmorphism)
    ├── /context
    │   └── AuthContext.jsx     # JWT storage, auto-logout on expiry
    ├── /components
    │   ├── Navbar.jsx          # Top navigation bar
    │   └── PostCard.jsx        # Post display card with media preview
    └── /pages
        ├── Login.jsx           # Auth form (login + register toggle)
        ├── Dashboard.jsx       # Posts grid + bulk delete
        └── Composer.jsx        # New post form + live preview
```

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
Edit `.env`:
```
VITE_API_URL=http://localhost:5000
```
After deploying the backend to Render, change this to your live Render URL.

### 3. Run locally
```bash
npm run dev
```
Opens at `http://localhost:5173`.

---

## Key Implementation Details

### FormData Submission (Composer.jsx)
When creating a post with media, the frontend uses `FormData` and does **not** set `Content-Type` manually — the browser automatically adds the `multipart/form-data` boundary.

```js
const formData = new FormData();
formData.append('title', title);
formData.append('platforms', JSON.stringify(selectedPlatforms));
formData.append('media', mediaFile); // file object

fetch(`${API}/api/posts`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` }, // NO Content-Type
  body: formData,
});
```

### Render Cold-Start Handling (Login.jsx)
After 3 seconds of a login request being in-flight, the UI shows:
> "Waking up the server… this may take up to 60 seconds on first load."

---

## Deploying to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel: **Add New → Project** → import the repo.
3. Before clicking **Deploy**, go to **Environment Variables** and add:
   - `VITE_API_URL` = your live Render backend URL (e.g. `https://my-backend.onrender.com`)
4. Deploy. Vercel auto-detects Vite.

> **After deploy**: Go back to your Render backend and update `CLIENT_URL` to your new Vercel URL, then redeploy the backend so CORS allows requests from your live frontend.
