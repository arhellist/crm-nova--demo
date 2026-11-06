/**
 * DEC-060: POST /api/auth/managers — только manager, пароль в ответе один раз.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { registerAuthRoutes } from './routes.js';
import type { GoTrueClient } from './gotrue.js';
import type { AdminClient } from './admin.js';
import { ACCESS_COOKIE, CSRF_COOKIE } from './cookies.js';

const managerId = '11111111-1111-4111-8111-111111111111';
const executorId = '22222222-2222-4222-8222-222222222222';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function buildApp(opts: {
  role: 'manager' | 'executor';
  admin: AdminClient | null;
}): Promise<ReturnType<typeof Fastify>> {
  const userId = opts.role === 'manager' ? managerId : executorId;
  const gotrue: GoTrueClient = {
    signInWithPassword: vi.fn(),
    refresh: vi.fn(),
    signOut: vi.fn(),
    getUser: vi.fn(async () => ({
      id: userId,
      email: opts.role === 'manager' ? 'manager@nova.local' : 'executor1@nova.local',
    })),
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/rest/v1/profiles')) {
        return new Response(
          JSON.stringify([
            {
              id: userId,
              full_name: opts.role === 'manager' ? 'Ирина Волкова' : 'Пётр Смирнов',
              role: opts.role,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ message: 'unexpected' }), { status: 500 });
    }),
  );

  const app = Fastify();
  await app.register(cookie);
  registerAuthRoutes(app, {
    gotrue,
    cookiePolicy: {
      path: '/',
      secure: false,
      accessMaxAgeS: 3600,
      refreshMaxAgeS: 86400,
    },
    allowedOrigins: ['http://127.0.0.1:5173'],
    supabaseUrl: 'https://example.supabase.co',
    anonKey: 'test-anon',
    admin: opts.admin,
  });
  return app;
}

describe('POST /api/auth/managers DEC-060', () => {
  it('исполнитель получает 403, admin.createManager не вызывается', async () => {
    const createManager = vi.fn();
    const app = await buildApp({
      role: 'executor',
      admin: { createManager },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/managers',
      headers: {
        origin: 'http://127.0.0.1:5173',
        'content-type': 'application/json',
        'x-csrf-token': 'csrf-token',
      },
      cookies: {
        [ACCESS_COOKIE]: 'access',
        [CSRF_COOKIE]: 'csrf-token',
      },
      payload: { email: 'new@nova.local', full_name: 'Новый Менеджер' },
    });

    expect(response.statusCode).toBe(403);
    expect(createManager).not.toHaveBeenCalled();
    await app.close();
  });

  it('manager создаёт учётку и получает одноразовый пароль', async () => {
    const createManager = vi.fn(async () => ({
      id: '44444444-4444-4444-8444-444444444444',
      email: 'new-manager@nova.local',
    }));
    const app = await buildApp({
      role: 'manager',
      admin: { createManager },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/managers',
      headers: {
        origin: 'http://127.0.0.1:5173',
        'content-type': 'application/json',
        'x-csrf-token': 'csrf-token',
      },
      cookies: {
        [ACCESS_COOKIE]: 'access',
        [CSRF_COOKIE]: 'csrf-token',
      },
      payload: { email: 'new-manager@nova.local', full_name: 'Новый Менеджер' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { email: string; full_name: string; password: string };
    expect(body.email).toBe('new-manager@nova.local');
    expect(body.full_name).toBe('Новый Менеджер');
    expect(body.password.length).toBe(20);
    expect(createManager).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new-manager@nova.local',
        fullName: 'Новый Менеджер',
        password: body.password,
      }),
    );
    await app.close();
  });

  it('без service_role (admin=null) отвечает 503', async () => {
    const app = await buildApp({ role: 'manager', admin: null });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/managers',
      headers: {
        origin: 'http://127.0.0.1:5173',
        'content-type': 'application/json',
        'x-csrf-token': 'csrf-token',
      },
      cookies: {
        [ACCESS_COOKIE]: 'access',
        [CSRF_COOKIE]: 'csrf-token',
      },
      payload: { email: 'new@nova.local', full_name: 'Новый' },
    });

    expect(response.statusCode).toBe(503);
    await app.close();
  });
});
