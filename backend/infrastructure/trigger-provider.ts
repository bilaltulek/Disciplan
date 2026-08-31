import { runs, tasks } from '@trigger.dev/sdk';

export interface AgentTaskProvider {
  triggerAgentRun(runId: string, dispatchKey?: string): Promise<{ providerRunId: string }>;
  cancelRun(providerRunId: string): Promise<void>;
}

export class TriggerDevProvider implements AgentTaskProvider {
  async triggerAgentRun(runId: string, dispatchKey = 'initial') {
    const handle = await tasks.trigger('disciplan-agent-run', { runId }, {
      idempotencyKey: `agent-run:${runId}:${dispatchKey}`,
      idempotencyKeyTTL: '30d',
      tags: [`run_${runId}`],
    });
    return { providerRunId: handle.id };
  }

  async cancelRun(providerRunId: string) {
    await runs.cancel(providerRunId);
  }
}
