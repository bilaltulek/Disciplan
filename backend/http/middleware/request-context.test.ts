import { describe, expect, it } from 'vitest';
import context from './request-context.js';

const { safeRequestId } = context;

describe('request context', () => {
  it('keeps safe caller correlation IDs and replaces unsafe values', () => {
    expect(safeRequestId('request-1234')).toBe('request-1234');
    expect(safeRequestId('bad value with spaces')).toMatch(/^[0-9a-f-]{36}$/);
    expect(safeRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
