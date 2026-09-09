import crypto from 'node:crypto';
import { deleteExpiredAgentMemory, executeAgentRun } from './agent-graph.js';

const config = require('./config.env');
const jobs = require('./agent-runs');

const workerId = `disciplan-worker-${crypto.randomUUID()}`;

type WorkerDependencies = {
  jobs: typeof jobs;
  executeAgentRun: typeof executeAgentRun;
  deleteExpiredAgentMemory: typeof deleteExpiredAgentMemory;
  maxAttempts: number;
};

export const createWorkerRunner = (overrides: Partial<WorkerDependencies> = {}) => {
  const dependencies: WorkerDependencies = {
    jobs,
    executeAgentRun,
    deleteExpiredAgentMemory,
    maxAttempts: config.agentWorkerMaxAttempts,
    ...overrides,
  };
  return async () => {
    await dependencies.deleteExpiredAgentMemory();
    const { leaseToken, rows } = await dependencies.jobs.claimPendingAgentJobs({ workerId, limit: 1 });
    for (const job of rows) {
      try {
        const runId = job.payload?.runId;
        if (typeof runId !== 'string') throw new Error('Agent job payload is missing runId.');
        await dependencies.executeAgentRun(runId);
        await dependencies.jobs.completeAgentJob(job.id, leaseToken);
      } catch (error) {
        const permanent = job.attempt_count >= dependencies.maxAttempts;
        if (permanent && typeof job.payload?.runId === 'string') {
          await dependencies.jobs.setRunState({
            runId: job.payload.runId,
            status: 'failed',
            step: 'failed',
            detail: 'Agent worker exhausted its retry limit.',
            failureCode: 'AGENT_RETRY_EXHAUSTED',
            failureMessage: String((error as Error).message || error).slice(0, 300),
          });
        }
        await dependencies.jobs.failAgentJob(job.id, leaseToken, error, permanent);
      }
    }
    return rows.length;
  };
};

export const runWorkerOnce = createWorkerRunner();

async function main() {
  if (!config.agentWorkerEnabled) {
    console.log('Agent worker is disabled. Set AGENT_WORKER_ENABLED=true only in a non-production environment.');
    return;
  }
  // This process is deliberately separate from Vercel's request handler.
  for (;;) {
    const count = await runWorkerOnce();
    await new Promise((resolve) => setTimeout(resolve, count ? 0 : config.agentWorkerPollMs));
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Agent worker stopped:', error.message);
    process.exitCode = 1;
  });
}
