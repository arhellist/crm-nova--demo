/**
 * Маршруты Auth BFF: login / refresh / logout / me / csrf (DEC-053)
 * и провижининг менеджера POST /api/auth/managers (DEC-060).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AdminProvisioningError,
  type AdminClient,
} from './admin.js';
import {
  ACCESS_COOKIE,
  clearSessionCookies,
  CSRF_COOKIE,
  type CookiePolicy,
  REFRESH_COOKIE,
  setSessionCookies,
} from './cookies.js';
import { assertCsrf, issueCsrfToken } from './csrf.js';
import { GoTrueError, type GoTrueClient } from './gotrue.js';
import { generateManagerPassword } from './password.js';

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const createManagerBodySchema = z.object({
  email: z.string().email().max(254),
  full_name: z.string().trim().min(1).max(120),
});

const profileSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string(),
  role: z.enum(['manager', 'executor']),
});

export interface AuthRoutesOptions {
  gotrue: GoTrueClient;
  cookiePolicy: CookiePolicy;
  allowedOrigins: readonly string[];
  supabaseUrl: string;
  anonKey: string;
  /** null → POST /api/auth/managers отвечает 503 (DEC-060). */
  admin: AdminClient | null;
}

function rejectCsrf(reply: FastifyReply, check: { status: 403; message: string }): void {
  void reply.status(check.status).send({ error: { code: 'E_CSRF', message: check.message } });
}

export function registerAuthRoutes(app: FastifyInstance, options: AuthRoutesOptions): void {
  const { gotrue, cookiePolicy, allowedOrigins, supabaseUrl, anonKey, admin } = options;

  async function loadCallerProfile(
    access: string,
  ): Promise<{ id: string; full_name: string; role: 'manager' | 'executor' } | null> {
    let user: { id: string };
    try {
      user = await gotrue.getUser(access);
    } catch {
      return null;
    }
    const base = supabaseUrl.replace(/\/+$/, '');
    const search = new URLSearchParams({
      select: 'id,full_name,role',
      id: `eq.${user.id}`,
    });
    const response = await fetch(`${base}/rest/v1/profiles?${search.toString()}`, {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${access}`,
        accept: 'application/json',
      },
    });
    if (!response.ok) {
      return null;
    }
    const rows = z.array(profileSchema).safeParse(await response.json());
    if (!rows.success || rows.data.length === 0) {
      return null;
    }
    const profile = rows.data[0]!;
    return profile.id === user.id ? profile : null;
  }

  app.get('/api/auth/csrf', async (_request, reply) => {
    const token = issueCsrfToken();
    void reply.setCookie(CSRF_COOKIE, token, {
      path: cookiePolicy.path,
      secure: cookiePolicy.secure,
      sameSite: 'lax',
      httpOnly: false,
      maxAge: cookiePolicy.refreshMaxAgeS,
    });
    return { csrf_token: token };
  });

  app.post('/api/auth/login', async (request, reply) => {
    const csrf = assertCsrf(request, allowedOrigins);
    if (!csrf.ok) {
      rejectCsrf(reply, csrf);
      return;
    }
    const body = loginBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: { code: 'E_VALIDATION', message: 'Проверьте email и пароль' },
      });
    }
    try {
      const tokens = await gotrue.signInWithPassword(body.data.email, body.data.password);
      const csrfToken = issueCsrfToken();
      setSessionCookies(reply, cookiePolicy, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        csrfToken,
      });
      return reply.status(204).send();
    } catch (error) {
      clearSessionCookies(reply, cookiePolicy);
      if (error instanceof GoTrueError) {
        return reply.status(401).send({
          error: { code: 'E_UNAUTHORIZED', message: 'Неверный email или пароль' },
        });
      }
      throw error;
    }
  });

  app.post('/api/auth/refresh', async (request, reply) => {
    const csrf = assertCsrf(request, allowedOrigins);
    if (!csrf.ok) {
      rejectCsrf(reply, csrf);
      return;
    }
    const refresh = request.cookies[REFRESH_COOKIE];
    if (!refresh) {
      clearSessionCookies(reply, cookiePolicy);
      return reply.status(401).send({
        error: { code: 'E_UNAUTHORIZED', message: 'Сессия истекла, войдите снова' },
      });
    }
    try {
      const tokens = await gotrue.refresh(refresh);
      const csrfToken = request.cookies[CSRF_COOKIE] ?? issueCsrfToken();
      setSessionCookies(reply, cookiePolicy, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        csrfToken,
      });
      return reply.status(204).send();
    } catch {
      clearSessionCookies(reply, cookiePolicy);
      return reply.status(401).send({
        error: { code: 'E_UNAUTHORIZED', message: 'Сессия истекла, войдите снова' },
      });
    }
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const csrf = assertCsrf(request, allowedOrigins);
    if (!csrf.ok) {
      rejectCsrf(reply, csrf);
      return;
    }
    const access = request.cookies[ACCESS_COOKIE];
    if (access) {
      await gotrue.signOut(access).catch(() => undefined);
    }
    clearSessionCookies(reply, cookiePolicy);
    return reply.status(204).send();
  });

  app.get('/api/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const access = request.cookies[ACCESS_COOKIE];
    if (!access) {
      return reply.status(401).send({
        error: { code: 'E_UNAUTHORIZED', message: 'Требуется вход' },
      });
    }

    // RLS на profiles читает всех (имена в UI). Текущий профиль — только свой id (DEC-059).
    let user: { id: string; email?: string | null };
    try {
      user = await gotrue.getUser(access);
    } catch (error) {
      if (error instanceof GoTrueError && error.status === 401) {
        return reply.status(401).send({
          error: { code: 'E_UNAUTHORIZED', message: 'Требуется вход' },
        });
      }
      return reply.status(502).send({
        error: { code: 'E_UPSTREAM', message: 'Не удалось проверить сессию' },
      });
    }

    const base = supabaseUrl.replace(/\/+$/, '');
    const search = new URLSearchParams({
      select: 'id,full_name,role',
      id: `eq.${user.id}`,
    });
    const response = await fetch(`${base}/rest/v1/profiles?${search.toString()}`, {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${access}`,
        accept: 'application/json',
      },
    });
    if (response.status === 401) {
      return reply.status(401).send({
        error: { code: 'E_UNAUTHORIZED', message: 'Требуется вход' },
      });
    }
    if (!response.ok) {
      return reply.status(502).send({
        error: { code: 'E_UPSTREAM', message: 'Не удалось загрузить профиль' },
      });
    }
    const rows = z.array(profileSchema).safeParse(await response.json());
    if (!rows.success || rows.data.length === 0) {
      return reply.status(401).send({
        error: { code: 'E_UNAUTHORIZED', message: 'Профиль недоступен' },
      });
    }
    const profile = rows.data[0]!;
    if (profile.id !== user.id) {
      return reply.status(401).send({
        error: { code: 'E_UNAUTHORIZED', message: 'Профиль недоступен' },
      });
    }
    return {
      profile,
      email: user.email ?? null,
    };
  });

  app.post('/api/auth/managers', async (request, reply) => {
    const csrf = assertCsrf(request, allowedOrigins);
    if (!csrf.ok) {
      rejectCsrf(reply, csrf);
      return;
    }
    if (!admin) {
      return reply.status(503).send({
        error: {
          code: 'E_PROVISIONING_UNAVAILABLE',
          message: 'Создание менеджеров временно недоступно',
        },
      });
    }

    const access = request.cookies[ACCESS_COOKIE];
    if (!access) {
      return reply.status(401).send({
        error: { code: 'E_UNAUTHORIZED', message: 'Требуется вход' },
      });
    }

    const caller = await loadCallerProfile(access);
    if (!caller) {
      return reply.status(401).send({
        error: { code: 'E_UNAUTHORIZED', message: 'Требуется вход' },
      });
    }
    if (caller.role !== 'manager') {
      return reply.status(403).send({
        error: { code: 'E_FORBIDDEN', message: 'Недостаточно прав' },
      });
    }

    const body = createManagerBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: { code: 'E_VALIDATION', message: 'Проверьте имя и email' },
      });
    }

    const password = generateManagerPassword();
    try {
      const created = await admin.createManager({
        email: body.data.email,
        password,
        fullName: body.data.full_name,
      });
      // Пароль только в ответе; в request.log его нет.
      return reply.status(201).send({
        email: created.email,
        full_name: body.data.full_name,
        password,
      });
    } catch (error) {
      if (error instanceof AdminProvisioningError) {
        return reply.status(error.status).send({
          error: { code: error.code, message: error.message },
        });
      }
      throw error;
    }
  });
}
