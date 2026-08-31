# Agent runtime operations

## Sources of truth

- Postgres owns threads, messages, run state, outbox delivery, immutable plan versions, approvals, task state, and AI usage.
- Trigger.dev owns physical task execution only.
- LangGraph checkpoints are resumable execution state only and use the `agent_memory` schema.
- Gemini can propose typed drafts but cannot mutate canonical product data.

## Deployment sequence

1. Create an isolated Neon branch and supply pooled API, direct worker, and migration URLs.
2. Run `npm run migrations:status`, then `npm run migrate` using `MIGRATION_DATABASE_URL`.
3. Create a Trigger project dedicated to Preview. Its managed Production
   environment is scoped only to Vercel Preview and the isolated Neon branch;
   it is not the Disciplan Production runtime.
4. Configure Vercel Preview only with the isolated database, a Preview JWT,
   the dedicated project's Production key, `AGENT_ROLLOUT_MODE=active`,
   `AGENT_RUNTIME_SCOPE=preview`, `DISCIPLAN_DATA_ENV=isolated-preview`, and the
   exact `TRIGGER_PROJECT_REF`. Do not reuse a multi-environment variable
   record; use Preview-only or deployment-scoped values.
5. Deploy with `npm run deploy:preview-runtime -- proj_<preview-project-ref>`;
   require all six tasks and a successful sanitized `disciplan-preview-smoke`
   result. The deployment helper refuses pooled worker URLs, database mismatch,
   and a local Production/Preview database collision.
6. Run the complete `npm run eval:agent` canary with the non-production Gemini key; `AGENT_EVAL_LIMIT` and `AGENT_EVAL_CASE_ID` samples are diagnostic only and cannot satisfy the release gate. Set `AGENT_EVAL_DELAY_MS` when the test project's request-per-minute quota requires pacing.
7. Enable `shadow`, inspect evaluation/cost signals, then enable `active` by staged traffic.
8. Do not remove migrations `003`-`005`, the legacy worker, or its queue until every shared environment reports no nonterminal legacy records and the rollback window is closed.

## Required configuration

- `DATABASE_URL`: pooled Vercel/API connection.
- `AGENT_DATABASE_URL`: bounded direct/worker connection used by Trigger and LangGraph.
- `MIGRATION_DATABASE_URL`: direct administrative connection.
- `TRIGGER_SECRET_KEY`: server credential used by the API.
- `TRIGGER_PROJECT_REF`: exact project selected by `trigger.config.ts` and the
  runtime guard; set it explicitly for every deployed runtime.
- `GEMINI_API_KEY`, `GEMINI_MODEL`: Trigger task model configuration; Gemini
  credentials never belong in Neon or browser-prefixed variables.
- `AGENT_ROLLOUT_MODE`: `off`, `shadow`, or `active`; production defaults to `off`. Off-mode form submissions publish a deterministic validated plan. Shadow mode also queues private non-publishing comparison drafts, while conversational commands remain disabled until active mode.
- `AGENT_VALIDATION_MODE=development`, `DISCIPLAN_DATA_ENV=isolated-preview`,
  `AGENT_VALIDATION_ACTIVE_USER_IDS`, and
  `AGENT_VALIDATION_SHADOW_USER_IDS`: free-plan preview validation boundary.
  Lists must be nonempty, numeric, and disjoint. Everyone outside them remains
  deterministic off-mode.
- `AGENT_VALIDATION_FAULTS_ENABLED`: normally false. It may be true only while
  exercising guarded Development/isolated-preview/allowlisted recovery cases.
- AI hard-stop, user request, output-token, model-call, revision, and reservation limits documented in the root README.
- `OTEL_EXPORTER_OTLP_ENDPOINT`: optional privacy-safe telemetry export. Raw prompt/output bodies are never emitted.

Runtime secret scope:

- Vercel Preview: isolated pooled `DATABASE_URL`, isolated direct
  `AGENT_DATABASE_URL`, the dedicated Preview project's Production
  `TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_REF`, `JWT_SECRET`, active rollout,
  Preview runtime/data markers, and AI limits. Do not provide Gemini or
  migration credentials.
- Dedicated Trigger Preview runtime: the same isolated direct database for
  `DATABASE_URL` and `AGENT_DATABASE_URL`, Gemini credentials,
  `TRIGGER_PROJECT_REF`, active rollout, Preview runtime/data markers, and AI
  limits. Never provide the API JWT or migration credential.
- Trigger Development: the same values may be used for local task testing with
  a Development key and `npx trigger.dev@4.5.14 dev`.
- Migration workstation/CI only: direct `MIGRATION_DATABASE_URL`.

## Incident controls

- Disable model execution by removing the Gemini key or exhausting the configured hard stop; deterministic fallback remains in the graph.
- Stop new proactive proposals by setting rollout mode to `off` and disabling the Trigger schedule.
- Cancel an active run through the API. Postgres is updated first; provider cancellation is best effort, and late results cannot publish.
- A failed dispatch remains in `agent_dispatch_outbox`; the five-minute reconciler retries it with a stable idempotency key.
- Never edit a checkpoint or force a published plan manually. Resume through clarification/approval commands or create an auditable retry run.

## Reconciliation queries

Before cutover or cleanup, verify:

```sql
SELECT status, COUNT(*) FROM agent_runs GROUP BY status;
SELECT status, COUNT(*) FROM agent_dispatch_outbox GROUP BY status;
SELECT status, COUNT(*) FROM plan_generation_runs GROUP BY status;
SELECT COUNT(*) FROM agent_run_jobs WHERE completed_at IS NULL;
SELECT assignment_id, COUNT(*) FROM plan_versions WHERE status = 'published' GROUP BY assignment_id HAVING COUNT(*) > 1;
```

Expected: no outbox row remains `dispatching` beyond five minutes, no active run exceeds ten minutes, no assignment has multiple published versions, and legacy nonterminal counts are zero before contraction.

## Retention and privacy

- Checkpoints expire after 30 inactive days.
- Sanitized internal run events and detailed usage expire after 90 days.
- Monthly aggregate cost records remain for 13 months.
- User-visible conversations and plan versions remain until user/account deletion.
- Trigger payloads contain only opaque run IDs and tags. Production telemetry excludes prompts, outputs, message text, headers, and secrets.

## Free-plan Preview runtime

- Trigger's free managed Production environment belongs to the dedicated
  Preview project only. Vercel Production must never receive its key.
- Managed schedules run without a developer workstation. Dispatch,
  cancellation, checkpoint resume, reconciliation, health scans, shadow scans,
  and retention are validated against disposable Preview accounts.
- Runtime guards require Trigger `PRODUCTION`, Preview scope, the exact project
  reference, active rollout, and the isolated data marker.
- Local development remains available through the project's Development key;
  it does not replace the always-on managed Preview runtime.

## Dependency security policy

- Root and frontend complete dependency trees must both pass
  `npm audit --audit-level=low` before release.
- Root overrides keep Trigger's nested OpenTelemetry core and build-time
  `deepmerge-ts` on patched compatible versions. Every dependency update must
  rerun typecheck, tests, and a Trigger deployment dry run.
- Never use `npm audit fix --force` when it proposes a framework/runtime major
  downgrade. Review and test a compatible direct update or narrowly scoped
  override instead.
