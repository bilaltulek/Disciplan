import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = require('../../db');
const { createRateLimiter, hashKey } = require('./rate-limit');

describe('database-backed rate limiting', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('hashes source identifiers before persistence', () => {
    expect(hashKey('203.0.113.4')).not.toContain('203.0.113.4');
    expect(hashKey('203.0.113.4')).toBe(hashKey('203.0.113.4'));
  });

  it('rejects requests beyond the configured bucket', async () => {
    vi.spyOn(db, 'query').mockResolvedValue({ rows: [{ request_count: 3 }] });
    const limiter = createRateLimiter({ scope: 'test', limit: 2, windowMs: 60_000, key: () => 'actor' });
    const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    const next = vi.fn();
    await limiter({}, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });
});
