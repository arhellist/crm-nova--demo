/**
 * CSRF для cookie-сессии: Origin allowlist + double-submit (DEC-053, ТЗ §8.7 п.6).
 */
import { randomBytes } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { CSRF_COOKIE } from './cookies.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function issueCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

export function isAllowedOrigin(origin: string | undefined, allowlist: readonly string[]): boolean {
  if (origin === undefined) {
    // Same-origin навигация/fetch иногда без Origin (например, same-site GET).
    return true;
  }
  return allowlist.includes(origin);
}

/**
 * Для небезопасных методов: Origin в allowlist и заголовок X-CSRF-Token == cookie nova_csrf.
 */
export function assertCsrf(
  request: FastifyRequest,
  allowlist: readonly string[],
): { ok: true } | { ok: false; status: 403; message: string } {
  if (SAFE_METHODS.has(request.method)) {
    return { ok: true };
  }
  if (!isAllowedOrigin(request.headers.origin, allowlist)) {
    return { ok: false, status: 403, message: 'Запрос отклонён: недопустимый Origin' };
  }
  const header = request.headers['x-csrf-token'];
  const token = typeof header === 'string' ? header : Array.isArray(header) ? header[0] : undefined;
  const cookieToken = request.cookies[CSRF_COOKIE];
  if (!token || !cookieToken || token !== cookieToken) {
    return { ok: false, status: 403, message: 'Запрос отклонён: CSRF' };
  }
  return { ok: true };
}
