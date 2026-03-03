# Disciplan

- Website: https://disciplan.vercel.app/

Disciplan helps students turn overwhelming assignments into clear, day-by-day plans so they can stay consistent, focused, and on track. It combines planning, execution, and progress tracking in one place. 📚

## ✨ What Disciplan Does

Disciplan is an AI-powered assignment planning platform that converts large workloads into actionable study tasks with realistic daily structure.

## 🚀 Features

- Break assignments into day-by-day tasks
- Generate plans with Gemini AI plus deterministic fallback logic
- Track progress across Dashboard, Timeline, and History
- Manage authenticated user sessions
- Personalize defaults for workload, difficulty, and start page
- Configure theme preference (`light`, `dark`, `system`)

## 🧱 Tech Stack

| Layer | Stack |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, Radix UI |
| API | Express 5 (serverless-compatible) |
| Database | Neon Postgres (`pg`) |
| Auth | JWT in HttpOnly cookies |
| AI | Gemini (`@google/generative-ai`) |

## ⚙️ Quick Start

### 1) Prerequisites

- Node.js 20+
- npm 10+
- A Postgres database (Neon or local)

### 2) Install dependencies

```bash
npm install
cd frontend && npm install
```

### 3) Configure environment variables

Create `backend/.env` (or root `.env`) with:

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require
JWT_SECRET=replace-with-a-long-random-secret-at-least-32-characters
GEMINI_API_KEY=your-gemini-api-key
PORT=5000
CORS_ORIGINS=http://localhost:5173
NODE_ENV=development
```

### 4) Run migrations

```bash
npm run migrate
```

### 5) Start the app

Backend (root):

```bash
npm run start:backend
```

Frontend (separate terminal):

```bash
cd frontend
npm run dev
```

## 🔐 Environment Variables

Required variables:

- `DATABASE_URL`
- `JWT_SECRET`
- `GEMINI_API_KEY`
- `PORT`
- `CORS_ORIGINS`
- `NODE_ENV`

## 🧪 Scripts

Root:

```bash
npm run start:backend
npm run migrate
npm run check:backend
```

Frontend:

```bash
cd frontend
npm run dev
npm run lint
npm run build
npm run preview
```

## 🔌 API Overview

Auth:

- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`

Settings:

- `GET /api/settings`
- `PATCH /api/settings`

Assignments and Tasks:

- `GET /api/assignments`
- `POST /api/assignments`
- `DELETE /api/assignments/:id`
- `GET /api/assignment/plan/:id`
- `GET /api/timeline`
- `GET /api/history`
- `PATCH /api/tasks/:id`
- `PATCH /api/tasks/:id/toggle`
- `DELETE /api/tasks/:id`

## 🌍 Deployment

### Vercel + Neon

- Create a Neon project and copy `DATABASE_URL`
- Run migrations:

```bash
npm run migrate
```

- Import repository into Vercel
- Keep project root as deployment root (`vercel.json` is already configured)
- Add production environment variables:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `GEMINI_API_KEY`
  - `CORS_ORIGINS`
  - `NODE_ENV=production`

Routing behavior:

- `/api/*` -> serverless Express handler (`api/index.js`)
- non-API routes -> frontend `index.html` (SPA deep-link support)

## 🤝 Contributing

1. Create a feature branch
2. Make focused changes
3. Run lint/build/check scripts
4. Open a PR with clear testing notes
