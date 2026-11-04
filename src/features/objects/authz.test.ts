// @vitest-environment node
/**
 * Тесты прав: исполнитель не создаёт и не правит объекты; ошибки без деталей БД.
 *
 * @acceptance A05.3
 * @acceptance A05.6
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createObject, updateObject } from './api.js';
import * as authApi from '../auth/api.js';

vi.mock('../auth/api.js', () => ({
  supabase: { auth: { getSession: vi.fn() } },
  supabaseUrl: 'https://db.nova.test',
  supabaseAnonKey: 'anon-key',
}));

function errorResponse(status: number, code: string): Response {
  return new Response(JSON.stringify({ code, message: 'permission denied for table objects' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.mocked(authApi.supabase.auth.getSession).mockResolvedValue({
    data: { session: { access_token: 'executor-jwt' } },
    error: null,
  } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('права на объекты', () => {
  it('A05.3 исполнитель: создание отклонено 42501, ни одной записи', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(403, '42501'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createObject({ title: 'Новый объект', address: 'ул. Тестовая, 1' }),
    ).rejects.toMatchObject({ message: 'Недостаточно прав' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('A05.6 исполнитель: правка чужого объекта даёт 0 строк и понятную ошибку', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      updateObject('44444444-4444-4444-8444-444444444444', {
        title: 'Подменённое название',
        address: 'ул. Тестовая, 2',
      }),
    ).rejects.toMatchObject({ message: 'Объект не найден или недоступен' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/rest/v1/objects?id=eq.44444444-4444-4444-8444-444444444444');
    expect(init.method).toBe('PATCH');
    const body = z.record(z.unknown()).parse(JSON.parse(String(init.body)));
    expect(body).toEqual({ title: 'Подменённое название', address: 'ул. Тестовая, 2' });
  });
});
