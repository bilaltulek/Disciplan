const defaultHeaders: HeadersInit = {
  'Content-Type': 'application/json',
};

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface ApiRequestOptions extends RequestInit {
  headers?: HeadersInit;
  suppressAuthRedirect?: boolean;
}

const readCookie = (name: string): string | undefined => {
  if (typeof document === 'undefined') return undefined;
  const prefix = `${name}=`;
  const cookie = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : undefined;
};

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { suppressAuthRedirect = false, ...requestOptions } = options;
  const method = (options.method || 'GET').toUpperCase();
  const csrfToken = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
    ? readCookie('disciplan_csrf')
    : undefined;
  const response = await fetch(path, {
    credentials: 'include',
    ...requestOptions,
    headers: {
      ...defaultHeaders,
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(requestOptions.headers || {}),
    },
  });

  const contentType = response.headers.get('content-type') || '';
  let payload: unknown = null;
  if (contentType.includes('application/json')) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && !suppressAuthRedirect) {
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
    const serverMessage = typeof payload === 'object' && payload && 'error' in payload && typeof payload.error === 'string'
      ? payload.error.trim()
      : '';
    const payloadRequestId = typeof payload === 'object' && payload && 'requestId' in payload && typeof payload.requestId === 'string'
      ? payload.requestId
      : '';
    const responseRequestId = response.headers.get('x-request-id') || '';
    const requestId = [payloadRequestId, responseRequestId]
      .find((value) => /^[a-zA-Z0-9-]{8,128}$/.test(value));
    const fallback = response.status >= 500
      ? `The server could not complete this request (${response.status}).`
      : `Request failed (${response.status}).`;
    const reference = response.status >= 500 && requestId ? ` Reference: ${requestId}.` : '';
    const message = `${serverMessage || fallback}${reference}`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}
