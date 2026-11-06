// @vitest-environment node
/**
 * Тесты контракта задач через Data Gateway (DEC-053).
 *
 * @acceptance A07.1
 * @acceptance A07.2
 * @acceptance A07.6
 * @acceptance A07.7
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createTask, getTask, listMyTasks, listTasksByObject, TaskApiError } from './api.js';
import type { TaskRow } from './types.js';
import { stubApiFetch } from '../../test/stub-api-fetch.js';

const objectId = '33333333-3333-4333-8333-333333333333';
const assigneeId = '22222222-2222-4222-8222-222222222222';
const authorId = '11111111-1111-4111-8111-111111111111';

function task(index: number, overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`,
    object_id: objectId,
    title: `Задача ${String(index).padStart(2, '0')}`,
    description: '',
    status: 'new',
    assignee_id: assigneeId,
    author_id: authorId,
    created_at: `2026-11-01T10:00:${String(index).padStart(2, '0')}Z`,
    updated_at: `2026-11-01T10:00:${String(index).padStart(2, '0')}Z`,
    archived_at: null,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('createTask', () => {
  it('A07.1 менеджер создаёт задачу без статуса, сервер возвращает new', async () => {
    const row = task(1);
    row.status = 'new';
    stubApiFetch((url, init) => {
      expect(url).toContain('/api/data/tasks');
      expect(init?.method).toBe('POST');
      const body = z.record(z.unknown()).parse(JSON.parse(String(init?.body)));
      expect(body).toEqual({
        object_id: objectId,
        title: 'Монтаж окон',
        description: 'Второй этаж',
        assignee_id: assigneeId,
      });
      expect(body).not.toHaveProperty('status');
      expect(body).not.toHaveProperty('author_id');
      return jsonResponse([row], 201);
    });

    const created = await createTask({
      object_id: objectId,
      title: 'Монтаж окон',
      description: 'Второй этаж',
      assignee_id: assigneeId,
    });

    expect(created.status).toBe('new');
    expect(created.author_id).toBe(authorId);
  });

  it('A07.2 исполнителю запись запрещена: 42501 без создания строки', async () => {
    stubApiFetch(() =>
      jsonResponse({ code: '42501', message: 'new row violates row-level security policy' }, 403),
    );

    await expect(
      createTask({
        object_id: objectId,
        title: 'Чужая задача',
        assignee_id: assigneeId,
      }),
    ).rejects.toMatchObject({ status: 403, message: 'Недостаточно прав' });
  });
});

describe('listTasksByObject', () => {
  it('A07.6 30 задач: две страницы по курсору, порядок created_at desc, без offset и COUNT', async () => {
    const all = Array.from({ length: 30 }, (_, index) => task(index + 1)).sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
    let calls = 0;
    stubApiFetch((url) => {
      calls += 1;
      if (calls === 1) {
        expect(url).toContain('/api/data/tasks');
        expect(url).toContain('order=created_at.desc%2Cid.desc');
        expect(url).toContain(`object_id=eq.${objectId}`);
        expect(url).toContain('archived_at=is.null');
        expect(url).toContain('limit=21');
        expect(url).not.toContain('offset=');
        expect(url).not.toContain('count=');
        return jsonResponse(all.slice(0, 21));
      }
      expect(url).toContain('created_at.lt.');
      expect(url).toContain('id.lt.');
      return jsonResponse(all.slice(20));
    });

    const first = await listTasksByObject(objectId, { limit: 20 });
    expect(first.items).toHaveLength(20);
    const lastOfFirst = first.items.at(-1);
    expect(first.nextCursor).toEqual({ created_at: lastOfFirst?.created_at, id: lastOfFirst?.id });

    const second = await listTasksByObject(objectId, { limit: 20, cursor: first.nextCursor });
    expect(second.items).toHaveLength(10);
    expect(second.nextCursor).toBeNull();

    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(30);
  });
});

describe('listMyTasks', () => {
  it('DEC-022 статус уходит фильтром status=eq, assignee_id не передаётся', async () => {
    stubApiFetch((url) => {
      expect(url).toContain('status=eq.in_progress');
      expect(url).not.toContain('assignee_id=eq');
      return jsonResponse([task(1, { status: 'in_progress' })]);
    });

    const page = await listMyTasks({ status: 'in_progress' });
    expect(page.items).toHaveLength(1);
  });
});

describe('getTask', () => {
  it('A07.7 чужая задача: пустой ответ RLS превращается в «Задача не найдена» без деталей', async () => {
    stubApiFetch((url) => {
      expect(url).toContain('select=id%2Cobject_id%2Ctitle%2Cdescription%2Cstatus');
      expect(url).not.toContain('select=*');
      return jsonResponse([]);
    });

    await expect(getTask('44444444-4444-4444-8444-000000000099')).rejects.toMatchObject({
      message: 'Задача не найдена',
      status: 404,
    });
  });
});
