/**
 * DEC-059: /api/auth/me возвращает профиль владельца сессии, не rows[0] из всего списка.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { registerAuthRoutes } from './routes.js';
import type { GoTrueClient } from './gotrue.js';
import { ACCESS_COOKIE } from './cookies.js';

const manager = {
  id: '11111111-1111-4111-8111-111111111111',
  full_name: 'Ирина Волкова',
  role: 'manager' as const,
};
const executor = {
  id: '22222222-2222-4222-8222-222222222222',
  full_name: 'Пётр Смирнов',
  role: 'executor' as const,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('GET /api/auth/me DEC-059', () => {
  it('исполнитель получает свой профиль, даже если manager идёт первым в таблице', async () => {
    const gotrue: GoTrueClient = {
      signInWithPassword: vi.fn(),
      refresh: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(async () => ({
        id: executor.id,
        email: 'executor1@nova.local',
      })),
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain(`id=eq.${executor.id}`);
      expect(url).not.toMatch(/profiles\?select=[^&]*$/);
      return new Response(JSON.stringify([executor]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

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
      admin: null,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { [ACCESS_COOKIE]: 'access-token-executor' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      profile: executor,
      email: 'executor1@nova.local',
    });
    expect(response.json()).not.toMatchObject({ profile: manager });
    expect(gotrue.getUser).toHaveBeenCalledWith('access-token-executor');

    await app.close();
  });
});
