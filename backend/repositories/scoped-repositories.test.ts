import { describe, expect, it, vi } from 'vitest';
import { AssignmentRepository, ResourceNotFoundError } from './scoped-repositories.js';

describe('ownership-scoped repositories', () => {
  it('injects the actor user ID into assignment reads', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 9, user_id: 4 }] });
    const repository = new AssignmentRepository({ query } as never);
    await expect(repository.requireForActor({ userId: 4 }, 9)).resolves.toMatchObject({ id: 9 });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('user_id = $2'),
      [9, 4],
    );
  });

  it('does not distinguish missing from another user’s resource', async () => {
    const repository = new AssignmentRepository({
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as never);
    await expect(repository.requireForActor({ userId: 99 }, 9)).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
