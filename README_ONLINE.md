# Bill Manager - Online CRM Deployment Guide

Your CRM is now fully cross-compatible with **SQLite** (local) and **PostgreSQL** (online).

## Deployment Options

### **Option 1: All-in-One Docker (Recommended for Railway/Render/Fly.io)**
This is the simplest way to deploy. A single container hosts both the React app and the Node.js API.

1.  Push your code to GitHub.
2.  In your hosting provider (e.g., Railway), create a new service from your GitHub repo.
3.  Set the following **Environment Variables**:
    - `DATABASE_URL`: Your PostgreSQL connection string (provided by Railway/Supabase/Neon).
    - `JWT_SECRET`: A long random string for security.
    - `PORT`: 3001
4.  The provider will automatically use the `Dockerfile` at the root of the project to build the app.

### **Option 2: Separate Deployments (Vercel + Render)**
- **Frontend (Vercel):**
  - Set Root Directory to `client`.
  - Env Var: `VITE_API_BASE_URL` = Your backend URL.
- **Backend (Render):**
  - Set Root Directory to `server`.
  - Env Vars: `DATABASE_URL`, `JWT_SECRET`.

## Post-Deployment: Setup Your Admin User
Since you'll have a fresh database online:
1.  Connect to your server's terminal (or use a local script with the production `DATABASE_URL`).
2.  Run `node server/create_user.js` to create your login.

## Local Development
Run `npm run dev` in both folders. It will automatically use `bills.db` locally because `DATABASE_URL` is not set.
