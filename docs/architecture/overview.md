# Disciplan agent-first architecture

## System boundary

```text
React/Vite UI on Vercel
  -> Express command/query API on Vercel
    -> LangGraph supervisor executed by Trigger.dev
      -> capability-scoped tools and deterministic services
        -> Neon/Postgres or Gemini
```

The API authenticates the student, validates commands, and transactionally
persists a message/run plus dispatch outbox record. It never waits for a model.
Trigger.dev delivers the opaque run ID at least once. The worker reloads actor
and resource scope from Postgres and invokes the checkpointed graph. Postgres is
canonical; Trigger state and LangGraph checkpoints are execution metadata.

## Agent topology

The explicit `StateGraph` is the supervisor. It routes bounded typed state to:

- Coordinator: intent, target assignment, clarification, and read-only answers.
- Planning Specialist: candidate initial plan only.
- Plan Reviewer: semantic review only; deterministic validation is authoritative.
- Schedule Repair Specialist: smallest safe change set to an existing plan.

Specialists use LangChain structured output. They receive delimited untrusted
student data and no database, publish, approval, deletion, network, file, URL,
SQL, or secret capability. Agent output is always a draft.

## Deterministic services

Authentication, CSRF, rate limits, ownership, date parsing, timezone capacity,
cross-assignment load, schema/workload validation, idempotency, budget
reservation/reconciliation, draft persistence, exact-hash approval, publication,
cancellation, retention, and account deletion remain conventional code.

Initial form plans may publish after all deterministic gates. Any repair to a
published plan creates an immutable version and exact diff, interrupts for owner
approval, and publishes atomically only when the approved proposal hash remains
current. Completed tasks are immutable to bulk repair.

## Persistence

- `agent_threads`, `agent_messages`: user-visible conversation history.
- `agent_runs`, `agent_run_events`, `agent_run_resumes`: canonical lifecycle and resume commands.
- `agent_dispatch_outbox`: transactional, retry-safe Trigger dispatch.
- `plan_versions`, `plan_version_items`: immutable drafts/history and one current publication.
- `agent_approvals`: owner decision tied to an exact proposal hash.
- `user_planning_profiles`, `user_preference_memories`: explicit capacity and confirmed preferences.
- `agent_memory.*`: LangGraph checkpoint tables, installed only by migrations.

Every record is user-owned or reachable only through an owned parent. Public
repositories and services require actor context; model tool arguments never do.

## Reliability and privacy

External delivery is at least once; publication effects are exactly once.
Database constraints, transactions, advisory locks, outbox idempotency, Trigger
idempotency keys, checkpoint resume, one semantic revision, five model calls,
twelve tool calls, provider timeouts, and a ten-minute run deadline bound every
workflow. Cancellation is canonical before provider cancellation and is checked
again before publication.

Production telemetry records identifiers, versions, timings, status/error codes,
token counts, and costs, but not prompts, outputs, messages, headers, or secrets.
Checkpoint, run-event, and detailed usage retention is enforced by scheduled
tasks. User-visible conversations, plans, and confirmed preferences remain until
deletion.

See [the operations runbook](../operations/agent-runtime.md) for environment,
deployment, recovery, cleanup, and rollout procedures.
