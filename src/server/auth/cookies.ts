/**
 * Именование и флаги сессионных cookies Auth BFF (DEC-053, ADR-0005).
 *
 * Инварианты:
 *  - access и refresh — только HttpOnly; в JSON ответов и localStorage не попадают;
 *  - Secure включается на HTTPS (COOKIE_SECURE=1 или NODE_ENV=production);
 *  - SameSite=Lax: cookie уезжает на same-site навигации, не на cross-site POST без CSRF.
 */
import type { FastifyReply } from 'fastify';

export const ACCESS_COOKIE = 'nova_access';
export const REFRESH_COOKIE = 'nova_refresh';
export const CSRF_COOKIE = 'nova_csrf';

export interface CookiePolicy {
  secure: boolean;
  path: string;
  /** Максимальный возраст access-cookie в секундах (по умолчанию 1 ч). */
  accessMaxAgeS: number;
  /** Максимальный возраст refresh-cookie в секундах (по умолчанию 7 суток). */
  refreshMaxAgeS: number;
}

export function readCookiePolicy(env: NodeJS.ProcessEnv): CookiePolicy {
  const secure =
    env.COOKIE_SECURE === '1' ||
    env.COOKIE_SECURE === 'true' ||
    env.NODE_ENV === 'production';
  return {
    secure,
    path: env.COOKIE_PATH?.trim() || '/',
    accessMaxAgeS: 60 * 60,
    refreshMaxAgeS: 60 * 60 * 24 * 7,
  };
}

function baseFlags(policy: CookiePolicy): {
  path: string;
  secure: boolean;
  sameSite: 'lax';
  httpOnly: boolean;
} {
  return {
    path: policy.path,
    secure: policy.secure,
    sameSite: 'lax',
    httpOnly: true,
  };
}

/** Выставляет пару токенов и CSRF (CSRF читается JS для double-submit). */
export function setSessionCookies(
  reply: FastifyReply,
  policy: CookiePolicy,
  tokens: { accessToken: string; refreshToken: string; csrfToken: string },
): void {
  const common = baseFlags(policy);
  void reply.setCookie(ACCESS_COOKIE, tokens.accessToken, {
    ...common,
    maxAge: policy.accessMaxAgeS,
  });
  void reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...common,
    maxAge: policy.refreshMaxAgeS,
  });
  void reply.setCookie(CSRF_COOKIE, tokens.csrfToken, {
    path: policy.path,
    secure: policy.secure,
    sameSite: 'lax',
    httpOnly: false,
    maxAge: policy.refreshMaxAgeS,
  });
}

/** Стирает сессионные cookies (logout / отказ refresh). */
export function clearSessionCookies(reply: FastifyReply, policy: CookiePolicy): void {
  const common = baseFlags(policy);
  void reply.clearCookie(ACCESS_COOKIE, { path: common.path });
  void reply.clearCookie(REFRESH_COOKIE, { path: common.path });
  void reply.clearCookie(CSRF_COOKIE, { path: common.path, httpOnly: false });
}
