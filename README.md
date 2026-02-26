# Disciplan

Disciplan is an AI-powered assignment planning platform that turns large workloads into daily, trackable execution plans.

## Why Disciplan

- Breaks assignments into actionable day-by-day study tasks
- Keeps progress visible across Dashboard, Timeline, and History
- Supports authenticated user accounts and per-user settings
- Includes theme/system preferences and productivity defaults
- Uses AI generation with deterministic fallback planning logic

## Core Features

### Planning
- Create assignments with due date, workload, and difficulty
- Auto-generate study plans using Gemini (with local fallback templates)
- Task-level schedule and estimated duration output

### Execution
- Dashboard cards with progress and quick actions
- Timeline-first workflow for daily task completion/editing
- History view for completed task tracking and review

### Personalization
- Theme mode (`light`, `dark`, `system`)
- Start page preference after login
- Default assignment difficulty/workload
- Optional assignment delete confirmation

## Architecture

| Layer | Stack |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, Radix UI |
| API | Express 5 (serverless-compatible) |
| Database | Neon Postgres (`pg`) |
| Auth | JWT in HttpOnly cookies |
| AI | Gemini (`@google/generative-ai`) |

## App Flow

`Landing -> Auth (Login/Signup) -> Dashboard -> Timeline -> History -> Profile/Settings`

## Repository Structure

```text
.
├─ api/                  # Vercel function entrypoint
├─ backend/              # Express app, middleware, migrations
│  ├─ app.js             # Express app export (serverless-ready)
│  ├─ server.js          # Local dev runner (app.listen)
│  ├─ migrations/        # SQL schema migrations
│  └─ scripts/           # utility scripts (migrate, etc.)
├─ frontend/             # Vite React app
└─ vercel.json           # Vercel build + routing config
```

## Local Development

### Prerequisites

- Node.js 20+
- npm 10+
- A Postgres database (Neon or local)

### 1) Install dependencies

```bash
npm install
cd frontend && npm install
```

### 2) Configure environment variables

Create `backend/.env` (or root `.env`) with:

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require
JWT_SECRET=replace-with-a-long-random-secret-at-least-32-characters
GEMINI_API_KEY=your-gemini-api-key
PORT=5000
CORS_ORIGINS=http://localhost:5173
NODE_ENV=development
```

### 3) Run migrations

```bash
npm run migrate
```

### 4) Start backend and frontend

Backend (root):

```bash
npm run start:backend
```

Frontend (separate terminal):

```bash
cd frontend
npm run dev
```

## API Overview

### Auth
- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`

### Settings
- `GET /api/settings`
- `PATCH /api/settings`

### Assignments / Tasks
- `GET /api/assignments`
- `POST /api/assignments`
- `DELETE /api/assignments/:id`
- `GET /api/assignment/plan/:id`
- `GET /api/timeline`
- `GET /api/history`
- `PATCH /api/tasks/:id`
- `PATCH /api/tasks/:id/toggle`
- `DELETE /api/tasks/:id`

## Deployment (Vercel + Neon)

### 1) Neon Postgres setup

- Create a Neon project and copy `DATABASE_URL`
- Run migrations against Neon:

```bash
npm run migrate
```

### 2) Vercel setup

- Import this repository into Vercel
- Use project root (contains `vercel.json`)
- Add environment variables:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `GEMINI_API_KEY`
  - `CORS_ORIGINS`
  - `NODE_ENV=production`

### 3) Routing model

- `/api/*` is served by the serverless Express handler (`api/index.js`)
- All non-API routes fall back to frontend `index.html` to support SPA deep links

## Quality Gates

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

Backend syntax checks:

```bash
npm run check:backend
```

## Known Limitations

- No full account deletion flow implemented server-side yet (UI placeholder exists)
- No background job queue for AI generation; assignment generation is request-bound
- Current rate limiting is in-memory (single instance scope)

## Roadmap

- Add robust toast/error UX instead of `alert()` fallbacks
- Add automated tests (API integration + frontend e2e)
- Add optional analytics/observability for production operations

## Contributing

1. Create a feature branch
2. Make focused changes
3. Run quality gates
4. Open a PR with clear test notes

## License

Add a project license file (`LICENSE`) and update this section once chosen.
