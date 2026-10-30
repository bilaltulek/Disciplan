# Disciplan

[Disciplan](https://disciplan.vercel.app/) turns assignments into manageable daily study tasks. Students can create plans from a form or a conversation, review proposed changes before publication, and track work on the Dashboard, Timeline, and History pages.

## Stack

- React 19, Vite, Tailwind CSS, and Radix UI
- Express 5 API on Vercel, Neon Postgres, and JWT cookies with CSRF protection
- LangGraph and Gemini for bounded planning; Trigger.dev for durable execution

The API owns authentication and persistent state. Model output is a draft; deterministic validation and student approval govern publication.

## Local setup

Use Node.js 22+ and npm 10+. You also need a Postgres database. Run from the repository root:

```bash
npm ci
npm --prefix frontend ci
cp .env.example .env
npm run migrate
npm run start:backend
```

Set the values in the ignored `.env` before migrating. In a second terminal, run `npm --prefix frontend run dev` and open `http://localhost:5173`. Use a pooled connection for `DATABASE_URL` and direct connections for `AGENT_DATABASE_URL` and `MIGRATION_DATABASE_URL`.

The redacted [.env.example](.env.example) lists runtime settings. `JWT_SECRET`, database URLs, AI budget controls, Gemini models and key, `TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_REF`, `CORS_ORIGINS`, and `AGENT_ROLLOUT_MODE` must match the intended environment. `AGENT_ROLLOUT_MODE=off` keeps assignment forms on the validated deterministic planner and disables conversational execution; `shadow` evaluates private drafts; `active` enables agent commands.

WorkOS sign-in is optional. It needs `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, and an exact `WORKOS_REDIRECT_URI` ending in `/api/auth/callback`. Provider controls remain hidden until their individual flags and shared configuration are complete. Production uses its own credentials and the callback `https://disciplan.vercel.app/api/auth/callback`.

## Checks

```bash
npm run typecheck
npm test
npm run test:frontend
npm --prefix frontend run lint
npm --prefix frontend run build
npm run test:e2e
```

`npm run test:integration` runs Postgres integration tests through Testcontainers. Without Docker, set `TEST_DATABASE_URL` to a disposable empty database. Never point these tests at shared or production data. `npm run eval:agent` runs the model canary with a non-production Gemini key; it can incur provider cost.

## Deployment

`vercel.json` builds the frontend and routes `/api/*` to the Express handler. Set Vercel environment variables for the matching Neon database, JWT, Trigger project, rollout mode, CORS origins, and AI limits. Run `npm run migrations:status` and `npm run migrate` with a direct migration connection before rollout. Keep `MIGRATION_DATABASE_URL` out of Vercel.

Trigger.dev receives an opaque run ID; Postgres owns runs, plans, approvals, and task state. Use an isolated Neon branch and separate Trigger project for Preview. The optional Docker Compose setup serves the API and frontend locally; its `agents` profile is a transitional legacy worker and must not be enabled for production.

## Contributing

Make focused changes and run the checks above. Keep secrets and local notes out of Git. Existing SQL migrations are immutable; add a new migration for schema changes.
