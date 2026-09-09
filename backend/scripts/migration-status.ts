const db = require('../migration-db');

const MIGRATION_REQUIREMENTS = {
  '001_init.sql': [
    'table:users',
    'table:assignments',
    'table:study_tasks',
    'table:user_settings',
  ],
  '002_ai_usage_events.sql': ['table:ai_usage_events'],
  '003_agent_runs.sql': [
    'table:plan_generation_runs',
    'table:plan_generation_run_events',
    'table:agent_run_jobs',
    'table:ai_budget_reservations',
    'column:study_tasks.generation_run_id',
    'column:study_tasks.generation_ordinal',
  ],
  '004_agent_job_durability.sql': [
    'column:agent_run_jobs.lease_started_at',
    'column:agent_run_jobs.lease_token',
    'column:agent_run_jobs.next_attempt_at',
    'column:ai_budget_reservations.used_total_micro_usd',
    'column:ai_budget_reservations.reserved_request_count',
    'column:ai_budget_reservations.used_request_count',
    'column:ai_budget_reservations.finalized_at',
    'column:ai_usage_events.generation_run_id',
  ],
  '005_langgraph_agent_runtime.sql': [
    'column:agent_run_jobs.worker_id',
    'column:agent_run_jobs.lease_expires_at',
    'column:agent_run_jobs.completed_at',
    'column:agent_run_jobs.checkpoint_cleanup_after',
    'column:agent_run_jobs.checkpoint_cleaned_at',
  ],
  '006_agent_first_foundation.sql': [
    'table:agent_threads',
    'table:agent_messages',
    'table:agent_runs',
    'table:agent_run_events',
    'table:agent_run_resumes',
    'table:agent_dispatch_outbox',
    'column:agent_dispatch_outbox.dispatch_started_at',
    'column:agent_dispatch_outbox.dispatch_key',
    'table:plan_versions',
    'table:plan_version_items',
    'table:agent_approvals',
    'table:user_planning_profiles',
    'table:user_preference_memories',
    'table:api_rate_limits',
    'table:ai_usage_monthly_aggregates',
    'column:agent_runs.request_hash',
    'column:agent_runs.trigger_context',
    'column:agent_runs.attempt_number',
    'column:study_tasks.logical_task_id',
    'column:study_tasks.plan_version_id',
    'column:study_tasks.completed_at',
    'column:study_tasks.archived_at',
    'column:study_tasks.actual_minutes',
    'column:ai_usage_events.agent_run_id',
    'column:ai_budget_reservations.agent_run_id',
  ],
  '007_langgraph_checkpoint_schema.sql': [
    'table:agent_memory.checkpoint_migrations',
    'table:agent_memory.checkpoints',
    'table:agent_memory.checkpoint_blobs',
    'table:agent_memory.checkpoint_writes',
  ],
  '008_plan_feedback.sql': [
    'table:plan_feedback',
  ],
  '009_conversation_context.sql': [
    'column:agent_threads.context_state',
    'column:agent_threads.context_version',
    'column:agent_threads.summary_through_message_id',
    'column:agent_runs.resume_count',
  ],
  '010_workos_auth.sql': [
    'column:users.workos_user_id',
    'column:users.email_verified',
    'table:auth_oauth_states',
  ],
};

const classifyMigrationState = (availableObjects: any) => Object.fromEntries(
  Object.entries(MIGRATION_REQUIREMENTS).map(([migration, requirements]: any) => {
    const present = requirements.filter((requirement: any) => availableObjects.has(requirement));
    const state = present.length === 0
      ? 'missing'
      : present.length === requirements.length
        ? 'complete'
        : 'partial';
    return [migration, {
      state,
      present: present.length,
      required: requirements.length,
      missingObjects: requirements.filter((requirement: any) => !availableObjects.has(requirement)),
    }];
  }),
);

const readAvailableObjects = async (client: any) => {
  const [tables, columns] = await Promise.all([
    client.query(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_schema IN ('public', 'agent_memory')`,
    ),
    client.query(
      `SELECT table_schema, table_name, column_name
       FROM information_schema.columns
       WHERE table_schema IN ('public', 'agent_memory')`,
    ),
  ]);

  return new Set([
    ...tables.rows.map((row: any) => `table:${row.table_schema === 'public' ? '' : `${row.table_schema}.`}${row.table_name}`),
    ...columns.rows.map((row: any) => `column:${row.table_schema === 'public' ? '' : `${row.table_schema}.`}${row.table_name}.${row.column_name}`),
  ]);
};

const readMigrationLedger = async (client: any, availableObjects: any) => {
  if (!availableObjects.has('table:schema_migrations')) return null;
  const result = await client.query(
    'SELECT filename, applied_at FROM schema_migrations ORDER BY filename ASC',
  );
  return result.rows;
};

const inspectMigrationStatus = async (client: any) => {
  const availableObjects = await readAvailableObjects(client);
  return {
    ledger: await readMigrationLedger(client, availableObjects),
    inferred: classifyMigrationState(availableObjects),
  };
};

async function main() {
  const client = await db.connect();
  try {
    const report = await inspectMigrationStatus(client);
    console.log(JSON.stringify(report, null, 2));
    if (Object.values(report.inferred).some((migration: any) => migration.state === 'partial')) {
      console.error('Partial migration state detected. Use additive corrective migrations; do not rewrite applied SQL.');
      process.exitCode = 2;
    }
  } finally {
    client.release();
    await db.end();
  }
}

if (require.main === module) {
  main().catch((error: any) => {
    console.error(`Migration status check failed: ${error.message}`);
    process.exitCode = 1;
  });
}

export = {
  MIGRATION_REQUIREMENTS,
  classifyMigrationState,
  inspectMigrationStatus,
};
