import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(__filename);
const { deleteAccountCheckpoints } = require('./validation-accounts.js');

describe('validation account cleanup', () => {
  it('deletes checkpoint writes, blobs, and checkpoints before user rows cascade', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 2 });

    await expect(deleteAccountCheckpoints({ query })).resolves.toBe(6);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      expect.stringContaining('agent_memory.checkpoint_writes'),
      expect.stringContaining('agent_memory.checkpoint_blobs'),
      expect.stringContaining('agent_memory.checkpoints'),
    ]);
    expect(query.mock.calls.every(([sql]) => sql.includes("run.id::text || ':planner'"))).toBe(true);
  });
});
