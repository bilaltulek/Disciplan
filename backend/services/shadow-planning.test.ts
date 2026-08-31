import { describe, expect, it, vi } from 'vitest';
import { ShadowPlanningService } from './shadow-planning.js';

describe('shadow planning owner scope', () => {
  it('passes a validation-owner allowlist into candidate selection', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(new ShadowPlanningService({ query } as never).enqueueSample(10, [51])).resolves.toEqual([]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('a.user_id = ANY'), [10, [51]]);
  });
});
