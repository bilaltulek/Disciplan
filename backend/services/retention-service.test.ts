import { describe, expect, it, vi } from 'vitest';
import { RetentionService } from './retention-service.js';

describe('retention service', () => {
  it('deletes checkpoints by opaque run thread IDs and aggregates usage first', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'run-1' }] })
      .mockResolvedValue({ rowCount: 1, rows: [] });
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn(async () => client) };
    const result = await new RetentionService(pool as never).enforce(new Date('2026-08-25T00:00:00Z'));
    expect(result.checkpointRows).toBe(3);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('ai_usage_monthly_aggregates'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('agent_messages'))).toBe(false);
  });
});
