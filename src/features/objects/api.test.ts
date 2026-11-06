// @vitest-environment node
/**
 * Тесты контракта объектов через Data Gateway (DEC-053).
 *
 * @acceptance A05.1
 * @acceptance A05.4
 * @acceptance A05.5
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createObject, listObjects } from './api.js';
import type { ObjectRow } from './types.js';

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

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): void {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/auth/csrf')) {
      return jsonResponse({ csrf_token: 'test-csrf' });
    }
    return handler(url, init);
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('createObject', () => {
  it('A05.1 создаёт объект и возвращает только поля ObjectRow', async () => {
    stubFetch((url, init) => {
      expect(url).toContain('/api/data/objects');
      expect(init?.method).toBe('POST');
      return jsonResponse([row(1, 'ЖК Северный')], 201);
    });

    const created = await createObject({ title: 'ЖК Северный', address: 'ул. Лесная, 12' });

    expect(Object.keys(created).sort()).toEqual(
      ['address', 'archived_at', 'created_at', 'id', 'title'].sort(),
    );
    expect(created.title).toBe('ЖК Северный');
  });

  it('A05.5 SQL-подобная строка сохраняется как текст и не исполняется', async () => {
    const title = "'; drop table tasks; --";
    stubFetch((_url, init) => {
      expect(z.record(z.unknown()).parse(JSON.parse(String(init?.body)))).toMatchObject({ title });
      return jsonResponse([row(3, title)], 201);
    });

    const created = await createObject({ title, address: 'ул. Тестовая, 1' });
    expect(created.title).toBe(title);
  });
});

describe('listObjects', () => {
  it('A05.4 keyset: первая страница 20, вторая продолжает без повторов и пропусков', async () => {
    const all = Array.from({ length: 25 }, (_, index) => row(index + 1));
    let calls = 0;
    stubFetch((url) => {
      calls += 1;
      if (calls === 1) {
        expect(url).toContain('/api/data/objects');
        expect(url).toContain('select=id%2Ctitle%2Caddress%2Ccreated_at%2Carchived_at');
        expect(url).not.toContain('select=*');
        expect(url).toContain('limit=21');
        return jsonResponse(all.slice(0, 21));
      }
      expect(url).toContain('or=');
      expect(url).toContain('title.gt.');
      expect(url).not.toContain('offset=');
      return jsonResponse(all.slice(20));
    });

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
  });
});
