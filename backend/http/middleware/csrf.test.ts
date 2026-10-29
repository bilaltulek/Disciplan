import { describe, expect, it, vi } from 'vitest';

const { csrfProtection } = require('./csrf');

const response = () => {
  const headers = new Map();
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    getHeader: (name: any) => headers.get(name),
    setHeader: (name: any, value: any) => headers.set(name, value),
    headers,
  };
};

describe('CSRF protection', () => {
  it('issues a browser-readable token on safe requests', () => {
    const res = response();
    const next = vi.fn();
    csrfProtection({ method: 'GET', headers: {} }, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.headers.get('Set-Cookie')).toContain('disciplan_csrf=');
  });

  it('rejects cookie-authenticated mutation without a matching token', () => {
    const res = response();
    const next = vi.fn();
    csrfProtection({ method: 'POST', headers: { cookie: 'token=jwt; disciplan_csrf=expected' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts cookie-authenticated mutation with a matching token', () => {
    const res = response();
    const next = vi.fn();
    csrfProtection({
      method: 'POST',
      headers: { cookie: 'token=jwt; disciplan_csrf=expected', 'x-csrf-token': 'expected' },
    }, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
