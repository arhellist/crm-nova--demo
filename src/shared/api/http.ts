/**
 * Same-origin HTTP-клиент с cookies, CSRF и одним refresh при 401 (DEC-053).
 */
/// <reference types="vite/client" />

/**
 * Корень API: same-origin path (`/crm-nova`) или явный `VITE_API_BASE_URL`.
 *
 * Vite подхватывает `.env.local` при `build` — там часто `http://127.0.0.1:8080`.
 * В production такой loopback ломает CSP (`connect-src 'self'`) на публичном хосте (DEC-054).
 */
export function apiRoot(): string {
  const rawBase: unknown = import.meta.env.BASE_URL;
  const basePath = (typeof rawBase === 'string' ? rawBase : '/').replace(/\/+$/, '');
  const fromEnv: unknown = import.meta.env.VITE_API_BASE_URL;
  if (typeof fromEnv !== 'string' || fromEnv.trim().length === 0) {
    return basePath;
  }
  const trimmed = fromEnv.replace(/\/+$/, '');
  const isAbsolute = /^https?:\/\//i.test(trimmed);
  const isLoopback = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(trimmed);
  if (import.meta.env.PROD && isAbsolute && isLoopback) {
    return basePath;
  }
  return trimmed;
}

function readCsrfFromDocument(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)nova_csrf=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

let csrfWarm: Promise<string> | null = null;
let refreshInflight: Promise<boolean> | null = null;

/** Получает CSRF-cookie (и токен) до небезопасных методов. */
export async function ensureCsrf(): Promise<string> {
  const existing = readCsrfFromDocument();
  if (existing) return existing;
  if (!csrfWarm) {
    csrfWarm = (async () => {
      const response = await fetch(`${apiRoot()}/api/auth/csrf`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Не удалось инициализировать защиту формы');
      }
      const body = (await response.json()) as { csrf_token?: string };
      if (!body.csrf_token) {
        throw new Error('Не удалось инициализировать защиту формы');
      }
      return body.csrf_token;
    })().finally(() => {
      csrfWarm = null;
    });
  }
  return csrfWarm;
}

async function refreshSessionOnce(): Promise<boolean> {
  if (!refreshInflight) {
    refreshInflight = (async () => {
      try {
        const csrf = await ensureCsrf();
        const response = await fetch(`${apiRoot()}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'x-csrf-token': csrf },
        });
        return response.ok;
      } catch {
        return false;
      } finally {
        refreshInflight = null;
      }
    })();
  }
  return refreshInflight;
}

export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'credentials'> {
  /** Не повторять после refresh (внутренний флаг). */
  _retried?: boolean;
  /** Пропустить CSRF (только для GET csrf). */
  skipCsrf?: boolean;
}

/**
 * Fetch на same-origin API: credentials include, CSRF на мутациях,
 * ровно один refresh+retry при 401.
 */
export async function apiFetch(path: string, init: ApiFetchOptions = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (!init.skipCsrf && method !== 'GET' && method !== 'HEAD') {
    const csrf = await ensureCsrf();
    headers.set('x-csrf-token', csrf);
  }
  const response = await fetch(`${apiRoot()}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    method,
    headers,
    credentials: 'include',
  });

  if (response.status !== 401 || init._retried || path.includes('/api/auth/login')) {
    return response;
  }
  if (path.includes('/api/auth/refresh') || path.includes('/api/auth/logout')) {
    return response;
  }

  const refreshed = await refreshSessionOnce();
  if (!refreshed) {
    return response;
  }
  return apiFetch(path, { ...init, _retried: true });
}
