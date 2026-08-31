import { describe, expect, it } from 'vitest';
import { hashRequest } from './agent-command-service.js';

describe('agent command idempotency hashing', () => {
  it('is stable for the canonical request', () => {
    const request = { title: 'Essay', dueDate: '2026-09-01', totalItems: 5 };
    expect(hashRequest(request)).toBe(hashRequest(request));
  });

  it('changes when a material request field changes', () => {
    expect(hashRequest({ title: 'Essay', totalItems: 5 }))
      .not.toBe(hashRequest({ title: 'Essay', totalItems: 6 }));
  });
});
