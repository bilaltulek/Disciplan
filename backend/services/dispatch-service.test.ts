import { describe, expect, it, vi } from 'vitest';
import { DispatchService } from './dispatch-service.js';

describe('transactional outbox dispatch', () => {
  it('uses only the opaque run ID and records provider identity', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'outbox-1', run_id: 'run-1', dispatch_key: 'initial', attempt_count: 1 }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'outbox-1' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const provider = { triggerAgentRun: vi.fn(async () => ({ providerRunId: 'provider-1' })), cancelRun: vi.fn() };
    const service = new DispatchService({ query } as never, provider);
    await expect(service.dispatchPending()).resolves.toEqual([{ id: 'outbox-1', dispatched: true }]);
    expect(provider.triggerAgentRun).toHaveBeenCalledWith('run-1', 'initial');
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('run.user_id = ANY'), [25, null]);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("status = 'dispatched'"), ['outbox-1', 'provider-1']);
  });

  it('passes an explicit owner allowlist into the outbox claim', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const provider = { triggerAgentRun: vi.fn(), cancelRun: vi.fn() };
    await new DispatchService({ query } as never, provider).dispatchPending(10, [41, 42]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('run.user_id = ANY'), [10, [41, 42]]);
  });
});
