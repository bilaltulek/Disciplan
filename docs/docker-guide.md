# Docker for Disciplan

Docker packages an application with its runtime and dependencies. An **image**
is the reusable package; a **container** is a running copy of that image.
`Dockerfile.api` and `Dockerfile.web` describe how to build Disciplan's API and
browser application. `compose.yaml` starts both containers together.

## Why two containers?

The frontend is static files served by Nginx, while the backend is a long-lived
Express process. Keeping them separate lets each scale, restart, and deploy
independently. Nginx forwards browser requests from `/api/*` to the private
`api` container, so the browser sees one origin at `http://localhost:8080`.

The local stack intentionally sets `COOKIE_SECURE=false`, because a browser
cannot send secure cookies over `http://localhost`. This override is limited to
Compose; Vercel production retains secure cookies by default and HTTPS container
deployments should omit the override.

Neon is deliberately not a container: it remains the managed Postgres service
and the API connects through `DATABASE_URL`. The LangGraph worker is opt-in;
start it only with the `agents` Compose profile. No secrets
are baked into either image.

## First run

1. Install Docker Desktop and confirm it is running with `docker version`.
2. Copy `.env.docker.example` to `.env.docker` and replace every placeholder.
   Use an isolated Neon branch/database, never production.
3. Build and start the stack with `docker compose up --build`.
4. Open `http://localhost:8080`. The API health check is available at
   `http://localhost:8080/api/health`.
5. Stop it with `docker compose down`. This stops containers but does not touch
   Neon data.

To process queued plans in an isolated environment only, explicitly start the
worker profile: `docker compose --profile agents up --build`. It sets
`AGENT_WORKER_ENABLED=true` only inside the worker container; the API and all
production deployments remain unable to execute queued agent jobs.

Useful commands:

```bash
docker compose logs -f api
docker compose ps
docker compose down
docker compose build --no-cache
```

## Relationship to Vercel and Neon

This Docker setup is a local, portable alternative. Vercel continues serving
the production SPA and serverless API unchanged. Neon continues hosting the
database unchanged. A later production container-hosting decision would require
separate work for a registry, runtime platform, DNS, secret manager, monitoring,
and a safe Vercel cutover; none of that is included here.
