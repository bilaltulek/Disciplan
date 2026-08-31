import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkerRunner } from './agent-worker.js';

const jobs = {
  claimPendingAgentJobs: vi.fn(),
  completeAgentJob: vi.fn(),
  failAgentJob: vi.fn(),
  setRunState: vi.fn(),
};
const deleteExpiredAgentMemory = vi.fn();
const executeAgentRun = vi.fn();

describe('agent worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteExpiredAgentMemory.mockResolvedValue(0);
    jobs.claimPendingAgentJobs.mockResolvedValue({ leaseToken: 'lease', rows: [] });
  });

  const run = () => createWorkerRunner({
    jobs: jobs as never,
    deleteExpiredAgentMemory,
    executeAgentRun,
    maxAttempts: 3,
  })();

  it('cleans expired memory and completes a successful leased job', async () => {
    jobs.claimPendingAgentJobs.mockResolvedValue({
      leaseToken: 'lease', rows: [{ id: 'job-1', attempt_count: 1, payload: { runId: 'run-1' } }],
    });
    executeAgentRun.mockResolvedValue({ published: true });

    await expect(run()).resolves.toBe(1);
    expect(deleteExpiredAgentMemory).toHaveBeenCalledOnce();
    expect(executeAgentRun).toHaveBeenCalledWith('run-1');
    expect(jobs.completeAgentJob).toHaveBeenCalledWith('job-1', 'lease');
  });

  it('releases a failed job for retry before the retry limit', async () => {
    jobs.claimPendingAgentJobs.mockResolvedValue({
      leaseToken: 'lease', rows: [{ id: 'job-2', attempt_count: 1, payload: { runId: 'run-2' } }],
    });
    executeAgentRun.mockRejectedValue(new Error('transient failure'));

    await run();
    expect(jobs.setRunState).not.toHaveBeenCalled();
    expect(jobs.failAgentJob).toHaveBeenCalledWith('job-2', 'lease', expect.any(Error), false);
  });

  it('marks the run failed only after its retry limit is exhausted', async () => {
    jobs.claimPendingAgentJobs.mockResolvedValue({
      leaseToken: 'lease', rows: [{ id: 'job-3', attempt_count: 3, payload: { runId: 'run-3' } }],
    });
    executeAgentRun.mockRejectedValue(new Error('permanent failure'));

    await run();
    expect(jobs.setRunState).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-3', status: 'failed', failureCode: 'AGENT_RETRY_EXHAUSTED',
    }));
    expect(jobs.failAgentJob).toHaveBeenCalledWith('job-3', 'lease', expect.any(Error), true);
  });
});
