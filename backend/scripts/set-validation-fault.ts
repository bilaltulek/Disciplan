const { z } = require('zod');
const db = require('../db');
const config = require('../config.env');

const InputSchema = z.object({
  runId: z.string().uuid(),
  fault: z.enum(['transient_once_before_graph', 'pause_before_publish']),
});

const main = async () => {
  if (config.agentExecutionPolicy.validationMode !== 'development'
    || config.agentExecutionPolicy.dataEnvironment !== 'isolated-preview'
    || !config.agentExecutionPolicy.validationFaultsEnabled) {
    throw Object.assign(new Error('Development validation fault fixtures are disabled.'), {
      code: 'VALIDATION_FAULTS_DISABLED',
    });
  }
  const { runId, fault } = InputSchema.parse({ runId: process.argv[2], fault: process.argv[3] });
  const result = await db.query(
    `UPDATE agent_runs
     SET trigger_context = COALESCE(trigger_context, '{}'::jsonb) || jsonb_build_object('validationFault', $2::text),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = ANY($3::int[]) AND status IN ('accepted', 'queued')
     RETURNING id`,
    [runId, fault, config.agentExecutionPolicy.activeUserIds],
  );
  process.stdout.write(`${JSON.stringify({ updated: result.rowCount === 1 })}\n`);
  if (result.rowCount !== 1) process.exitCode = 1;
};

void main()
  .catch((error: any) => {
    process.stderr.write(`${error.code || 'VALIDATION_FAULT_FAILED'}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.end());
