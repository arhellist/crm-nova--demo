// @vitest-environment node
/**
 * Тесты контракта объектов: создание, keyset-пагинация и текст с SQL-подобными строками.
 *
 * @acceptance A05.1
 * @acceptance A05.4
 * @acceptance A05.5
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createObject, listObjects } from './api.js';
import type { ObjectRow } from './types.js';
import * as authApi from '../auth/api.js';

vi.mock('../auth/api.js', () => ({
  supabase: { auth: { getSession: vi.fn() } },
  supabaseUrl: 'https://db.nova.test',
  supabaseAnonKey: 'anon-key',
}));

function row(index: number, title = `Объект ${String(index).padStart(3, '0')}`): ObjectRow {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    title,
    address: `Адрес ${index}`,
    created_at: '2026-11-01T10:00:00Z',
    archived_at: null,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.mocked(authApi.supabase.auth.getSession).mockResolvedValue({
    data: { session: { access_token: 'jwt-token' } },
    error: null,
  } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('createObject', () => {
  it('A05.1 создаёт объект и возвращает только поля ObjectRow', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([row(1, 'ЖК Северный')], 201));
    vi.stubGlobal('fetch', fetchMock);

    const created = await createObject({ title: 'ЖК Северный', address: 'ул. Лесная, 12' });

    expect(Object.keys(created).sort()).toEqual(
      ['address', 'archived_at', 'created_at', 'id', 'title'].sort(),
    );
    expect(created.title).toBe('ЖК Северный');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://db.nova.test/rest/v1/objects');
    expect(init.method).toBe('POST');
    const body = z.record(z.unknown()).parse(JSON.parse(String(init.body)));
    expect(body).toEqual({ title: 'ЖК Северный', address: 'ул. Лесная, 12' });
    expect(body).not.toHaveProperty('archived_at');
  });

  it('A05.5 SQL-подобная строка сохраняется как текст и не исполняется', async () => {
    const title = "'; drop table tasks; --";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([row(3, title)], 201));
    vi.stubGlobal('fetch', fetchMock);

    const created = await createObject({ title, address: 'ул. Тестовая, 1' });

    expect(created.title).toBe(title);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(z.record(z.unknown()).parse(JSON.parse(String(init.body)))).toMatchObject({ title });
  });
});

describe('listObjects', () => {
  it('A05.4 keyset: первая страница 20, вторая продолжает без повторов и пропусков', async () => {
    const all = Array.from({ length: 25 }, (_, index) => row(index + 1));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(all.slice(0, 21)))
      .mockResolvedValueOnce(jsonResponse(all.slice(20)));
    vi.stubGlobal('fetch', fetchMock);

    const first = await listObjects({ limit: 20 });
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).toEqual({
      title: first.items[19]?.title,
      id: first.items[19]?.id,
    });

    const second = await listObjects({ limit: 20, cursor: first.nextCursor });
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();

    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(25);

    const [secondUrl] = fetchMock.mock.calls[1] as [string];
    expect(secondUrl).toContain('or=');
    expect(secondUrl).toContain('title.gt.');
    expect(secondUrl).not.toContain('offset=');
    expect(secondUrl).not.toContain('count=');

    const [firstUrl] = fetchMock.mock.calls[0] as [string];
    expect(firstUrl).toContain('select=id%2Ctitle%2Caddress%2Ccreated_at%2Carchived_at');
    expect(firstUrl).not.toContain('select=*');
    expect(firstUrl).toContain('limit=21');
  });
});
