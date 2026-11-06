// @vitest-environment node
/**
 * Тесты мутаций задачи через Data Gateway (DEC-053).
 *
 * @acceptance A07.3
 * @acceptance A07.4
 * @acceptance A07.5
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { changeTaskStatus } from './mutations.js';
import { updateTask } from './api.js';
import { stubApiFetch } from '../../test/stub-api-fetch.js';

const objectId = '33333333-3333-4333-8333-333333333333';
const assigneeId = '22222222-2222-4222-8222-222222222222';
const otherAssigneeId = '55555555-5555-4555-8555-555555555555';
const authorId = '11111111-1111-4111-8111-111111111111';
const taskId = '44444444-4444-4444-8444-000000000001';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function taskRow(status: 'new' | 'in_progress' | 'on_review' | 'rework' | 'accepted'): unknown {
  return {
    id: taskId,
    object_id: objectId,
    title: 'Монтаж окон',
    description: '',
    status,
    assignee_id: assigneeId,
    author_id: authorId,
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
    archived_at: null,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('changeTaskStatus', () => {
  it('A07.3 исполнитель переводит new → in_progress через RPC и получает новый статус', async () => {
    const fetchMock = stubApiFetch((url, init) => {
      expect(url).toContain('/api/data/rpc/change_task_status');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({
        p_task_id: taskId,
        p_target: 'in_progress',
        p_comment: null,
      });
      return jsonResponse('in_progress');
    });

    const status = await changeTaskStatus(taskId, 'in_progress');
    expect(status).toBe('in_progress');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('A07.4 переход из accepted отклонён P0422: текст доменный, статус не меняется', async () => {
    stubApiFetch(() => jsonResponse({ code: 'P0422', message: 'transition_not_allowed' }, 400));

    await expect(changeTaskStatus(taskId, 'rework', 'Вернуть в работу')).rejects.toMatchObject({
      message: 'Этот переход недоступен',
      status: 422,
    });
  });

  it('A07.4 возврат без комментария: P0422 comment_required даёт текст про доработку', async () => {
    stubApiFetch(() => jsonResponse({ code: 'P0422', message: 'comment_required' }, 400));

    await expect(changeTaskStatus(taskId, 'rework', '   ')).rejects.toMatchObject({
      message: 'Опишите, что доработать',
    });
  });
});

describe('updateTask', () => {
  it('A07.5 смена исполнителя в in_progress отклонена триггером, PATCH не содержит статуса', async () => {
    const fetchMock = stubApiFetch((_url, init) => {
      expect(init?.method).toBe('PATCH');
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.assignee_id).toBe(otherAssigneeId);
      expect(body).not.toHaveProperty('status');
      expect(body).not.toHaveProperty('author_id');
      return jsonResponse({ code: 'P0422', message: 'assignee_change_not_allowed' }, 400);
    });

    await expect(
      updateTask(taskId, {
        object_id: objectId,
        title: 'Монтаж окон',
        assignee_id: otherAssigneeId,
      }),
    ).rejects.toMatchObject({
      message: 'Исполнителя можно менять только в статусах «Новая» и «На доработке»',
      status: 422,
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('A07.5 успешная правка возвращает строку задачи', async () => {
    stubApiFetch(() => jsonResponse([taskRow('new')]));

    const updated = await updateTask(taskId, {
      object_id: objectId,
      title: 'Монтаж окон',
      assignee_id: assigneeId,
    });

    expect(updated.status).toBe('new');
    expect(updated.assignee_id).toBe(assigneeId);
  });
});
