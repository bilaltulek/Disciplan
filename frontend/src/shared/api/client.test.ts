import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiError } from './client';

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = 'disciplan_csrf=; Max-Age=0; Path=/';
  });

  it('sends mutation requests with credentials and the CSRF token', async () => {
    document.cookie = 'disciplan_csrf=csrf-preview-token; Path=/';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/api/assignments', { method: 'POST', body: JSON.stringify({ title: 'Test' }) });

    expect(fetchMock).toHaveBeenCalledWith('/api/assignments', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'csrf-preview-token',
      }),
    }));
  });

  it('preserves safe JSON errors returned by the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'A valid due date is required.',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })));

    await expect(apiRequest('/api/assignments', { method: 'POST' }))
      .rejects.toEqual(expect.objectContaining<ApiError>({
        name: 'ApiError',
        message: 'A valid due date is required.',
        status: 400,
      }));
  });

  it('reports status and a safe request reference for non-JSON server failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Internal details</html>', {
      status: 500,
      headers: {
        'Content-Type': 'text/html',
        'X-Request-ID': 'request-safe-1234',
      },
    })));

    await expect(apiRequest('/api/agent-threads', { method: 'POST' }))
      .rejects.toEqual(expect.objectContaining<ApiError>({
        name: 'ApiError',
        message: 'The server could not complete this request (500). Reference: request-safe-1234.',
        status: 500,
      }));
  });
});
