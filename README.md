# Disciplan

- Website: https://disciplan.vercel.app/

Disciplan helps students turn overwhelming assignments into clear, day-by-day plans so they can stay consistent, focused, and on track. It combines planning, execution, and progress tracking in one place. 📚

## ✨ What Disciplan Does

Disciplan is an agent-first assignment planning platform. A bounded LangGraph workflow understands student requests, produces typed plan drafts, validates them deterministically, and publishes only through authorized services. Published-plan repairs always require student approval.

## 🚀 Features

- Break assignments into day-by-day tasks
- Plan through a structured assignment form or conversational assistant
- Generate and repair plans with Gemini plus deterministic, capacity-aware fallback logic
- Review exact plan diffs before any published-plan change
- Control planning capacity, timezone, and confirmed agent memories
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
| Agent runtime | LangGraph `StateGraph`, bounded LangChain specialists |
| Durable execution | Trigger.dev Cloud |
| AI | Gemini through `@langchain/google-genai` |

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

Copy `.env.example` to the ignored root `.env` and replace placeholders. Use
the Neon pooled URL for `DATABASE_URL` and the dashboard-provided direct URL
for `AGENT_DATABASE_URL` and `MIGRATION_DATABASE_URL`; do not derive the direct
hostname manually.

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require
AGENT_DATABASE_URL=postgres://WORKER_USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require
MIGRATION_DATABASE_URL=postgres://MIGRATION_USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require
JWT_SECRET=replace-with-a-long-random-secret-at-least-32-characters
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_ROUTER_MODEL=gemini-3.5-flash-lite
GEMINI_AGENT_MODEL=gemini-3.6-flash
GEMINI_SEARCH_MODEL=gemini-3.6-flash
TRIGGER_SECRET_KEY=replace-with-trigger-server-secret
AGENT_ROLLOUT_MODE=off
AI_BUDGET_MONTHLY_USD=20
AI_BUDGET_HARD_STOP_USD=19
AI_MAX_OUTPUT_TOKENS=4096
AI_THINKING_BUDGET=0
AI_USER_DAILY_REQUEST_LIMIT=20
AI_AGENT_MAX_ITERATIONS=1
AI_AGENT_MAX_MODEL_CALLS=5
AI_AGENT_MAX_TOOL_CALLS=12
AI_AGENT_MAX_SEARCH_CALLS=2
AI_SEARCH_MONTHLY_REQUEST_LIMIT=100
AI_AGENT_RUN_MAX_RESERVATION_USD=0.10
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

- `DATABASE_URL` (pooled API connection)
- `AGENT_DATABASE_URL` (bounded Trigger/LangGraph worker connection)
- `MIGRATION_DATABASE_URL` (direct migration connection)
- `JWT_SECRET`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_ROUTER_MODEL`, `GEMINI_AGENT_MODEL`, `GEMINI_SEARCH_MODEL`
- `AI_BUDGET_MONTHLY_USD`
- `AI_BUDGET_HARD_STOP_USD`
- `AI_MAX_OUTPUT_TOKENS`
- `AI_THINKING_BUDGET`
- `AI_USER_DAILY_REQUEST_LIMIT`
- `AI_AGENT_MAX_ITERATIONS`
- `AI_AGENT_MAX_MODEL_CALLS`
- `AI_AGENT_MAX_TOOL_CALLS`
- `AI_AGENT_MAX_SEARCH_CALLS`, `AI_SEARCH_MONTHLY_REQUEST_LIMIT`
- `AI_AGENT_RUN_MAX_RESERVATION_USD`
- `TRIGGER_SECRET_KEY`
- `TRIGGER_PROJECT_REF` (defaults to the original development project; set explicitly for deployed runtimes)
- `AGENT_ROLLOUT_MODE` (`off`, `shadow`, or `active`; production defaults to `off`)
- `AGENT_RUNTIME_SCOPE` (`standard` or guarded `preview`)
- `PORT`
- `CORS_ORIGINS`
- `NODE_ENV`

## 🧪 Scripts

Root:

```bash
npm run start:backend
npm run migrate
npm run migrations:status
npm run check:backend
npm run typecheck
npm test
npm run test:frontend
npm run test:all
npm run test:integration
npm run test:e2e
npm run eval:agent
npm run audit:production
```

`npm run test:integration` uses Testcontainers by default. In environments
without Docker, point `TEST_DATABASE_URL` at a disposable empty Postgres
database; the integration suite must never target shared or production data.
`npm run eval:agent` executes the complete routing/draft/validation canary and
enforces the locked schema, invariant, approval, duplication, semantic, and
intent thresholds. It requires a non-production `GEMINI_API_KEY`; use
`AGENT_EVAL_LIMIT` or `AGENT_EVAL_CASE_ID` only for exploratory diagnostics
because filtered runs do not qualify as release evidence. Use
`AGENT_EVAL_DELAY_MS` to pace provider calls when required by a test account's
rate limit. `AGENT_EVAL_MAX_COST_USD` is a separate hard ceiling for the canary
and defaults to USD 2.

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
- `GET/PATCH /api/planning-profile`
- `GET /api/preference-memories`
- `POST /api/preference-memories/:id/confirm`
- `DELETE /api/preference-memories/:id`
- `DELETE /api/account`

Assignments and Tasks:

- `GET /api/assignments`
- `POST /api/assignments`
- `DELETE /api/assignments/:id`
- `POST /api/assignments/:id/tasks`
- `GET /api/assignment/plan/:id`
- `POST /api/assignments/:id/feedback`
- `GET /api/timeline`
- `GET /api/history`
- `PATCH /api/tasks/:id`
- `PATCH /api/tasks/:id/toggle`
- `DELETE /api/tasks/:id`

Agent planning runs:

- `GET /api/agent-runs/:id`
- `GET /api/agent-runs/:id/events`
- `POST /api/agent-runs/:id/retry`
- `POST /api/agent-runs/:id/cancel`

Conversations and approvals:

- `POST/GET /api/agent-threads`
- `GET /api/agent-threads/:id`
- `POST /api/agent-threads/:id/messages`
- `GET /api/approvals`
- `GET /api/approvals/:id`
- `POST /api/approvals/:id/decision`

Mutating requests require the HttpOnly session plus a matching CSRF token. Agent
commands additionally require an `Idempotency-Key` and return durable run
resources. Trigger.dev receives only an opaque run ID; Postgres remains the
canonical source of run and product state.

Rollout behavior is explicit: `off` publishes validated deterministic plans for
assignment forms and disables conversational execution; `shadow` keeps that
visible fallback while evaluating non-publishing agent drafts; `active` routes
explicit form and conversation commands through Trigger.dev/LangGraph. Proactive
schedule repair runs only in `active` mode.

## 🌍 Deployment

### Vercel + Neon + Trigger.dev

- Create an isolated Neon branch first and configure pooled API, direct worker,
  and direct migration connection strings
- Run migrations:

```bash
npm run migrate
```

- Import repository into Vercel
- Keep project root as deployment root (`vercel.json` is already configured)
- Add Vercel Preview environment variables:
  - `DATABASE_URL`
  - `AGENT_DATABASE_URL`
  - `JWT_SECRET`
  - `AI_BUDGET_MONTHLY_USD`
  - `AI_BUDGET_HARD_STOP_USD`
  - `AI_MAX_OUTPUT_TOKENS`
  - `AI_THINKING_BUDGET`
  - `AI_USER_DAILY_REQUEST_LIMIT`
  - `CORS_ORIGINS`
  - `AGENT_ROLLOUT_MODE=off` for the first deployment
  - `AGENT_VALIDATION_MODE=development`
  - `DISCIPLAN_DATA_ENV=isolated-preview`
  - disjoint `AGENT_VALIDATION_ACTIVE_USER_IDS` and
    `AGENT_VALIDATION_SHADOW_USER_IDS`
- Do not put `MIGRATION_DATABASE_URL` in Vercel.
- Trigger.dev project `proj_tepkfgmarlbrlywqkcao` is bound in
  `trigger.config.ts`. Free-plan validation uses Trigger Development only;
  start it with `npx trigger.dev@4.5.13 dev` and do not run a Trigger deploy.
  Configure the local Development runtime with
  `DATABASE_URL`, `AGENT_DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, AI
  budget controls, and `AGENT_ROLLOUT_MODE=off`. It does not need `JWT_SECRET`
  or `MIGRATION_DATABASE_URL`.
- Do not connect Trigger's paid Preview Branch integration. Vercel Preview uses
  the Development key while the local worker is connected. Validate all six
  exports and `disciplan-preview-smoke`; global rollout remains off and only
  disposable allowlisted users receive shadow/active validation behavior.
- For an always-on free-tier Preview, use a separate Trigger project whose
  managed Production environment is dedicated to the isolated Preview data.
  Set `TRIGGER_PROJECT_REF` to that project, `AGENT_RUNTIME_SCOPE=preview`,
  `DISCIPLAN_DATA_ENV=isolated-preview`, and `AGENT_ROLLOUT_MODE=active` in both
  the Trigger runtime and Vercel Preview. The guard rejects this scope outside
  Vercel Preview or when the Trigger project/database pairing does not match.
  Never point the preview-only Trigger project at Production Disciplan data.
- `NODE_ENV=production`
  - Optional only for local HTTP Docker Compose: `COOKIE_SECURE=false`

Routing behavior:

- `/api/*` -> serverless Express handler (`api/index.js`)
- non-API routes -> frontend `index.html` (SPA deep-link support)

## 🐳 Docker (local and portable)

Docker is an optional local API/web path. The checked-in Postgres polling worker
is transitional prototype code and must not be enabled in production; durable
agent execution uses Trigger.dev.

Read the step-by-step [Docker guide](docs/docker-guide.md) before running it.
See the [agent runtime runbook](docs/operations/agent-runtime.md) for deployment,
reconciliation, retention, incident controls, and the known dependency advisory.

## 🤝 Contributing

1. Create a feature branch
2. Make focused changes
3. Run lint/build/check scripts
4. Open a PR with clear testing notes
