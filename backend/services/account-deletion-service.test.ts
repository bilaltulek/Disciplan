import { describe, expect, it, vi } from 'vitest';

const { deleteAccount } = require('./account-deletion-service');

describe('account deletion authentication', () => {
  it('fails safely without invoking bcrypt for provider-only accounts', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 5, password: null }] })
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };
    const verifyPassword = vi.fn();
    const result = await deleteAccount({
      userId: 5,
      password: 'not-used',
      verifyPassword,
      cancelProviderRun: vi.fn(),
    }, { connect: vi.fn().mockResolvedValue(client) });

    expect(result).toEqual({ verified: false, deleted: false, reauthRequired: true });
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
