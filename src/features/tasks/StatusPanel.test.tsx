// @vitest-environment jsdom
/**
 * Тесты панели переходов: обязательный комментарий возврата и отсутствие оптимистичных изменений.
 *
 * @acceptance A08.3
 * @acceptance A08.4
 * @acceptance A08.5
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TaskPage } from './TaskPage.js';
import { changeTaskStatus } from './mutations.js';
import type { TaskHistoryRow } from './useTask.js';
import type { TaskStatus } from './types.js';
import * as sessionModule from '../auth/useSession.js';
import * as authApi from '../auth/api.js';

vi.mock('../auth/api.js', () => ({
  supabase: { auth: { getSession: vi.fn() } },
  supabaseUrl: 'https://db.nova.test',
  supabaseAnonKey: 'anon-key',
}));

vi.mock('../auth/useSession.js', () => ({
  useSession: vi.fn(),
}));

const objectId = '33333333-3333-4333-8333-333333333333';
const taskId = '44444444-4444-4444-8444-000000000001';
const assigneeId = '22222222-2222-4222-8222-222222222222';
const managerId = '11111111-1111-4111-8111-111111111111';

const profiles = [
  { id: assigneeId, full_name: 'Пётр Смирнов' },
  { id: managerId, full_name: 'Ирина Волкова' },
];

interface State {
  status: TaskStatus;
  history: TaskHistoryRow[];
}

function historyRow(
  id: number,
  from: TaskStatus | null,
  to: TaskStatus,
  changedBy: string,
  createdAt: string,
  comment: string | null = null,
): TaskHistoryRow {
  return { id, from_status: from, to_status: to, changed_by: changedBy, comment, created_at: createdAt };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function setupFetch(state: State, rpc: (comment: string | null) => Response): { rpcCalls: unknown[] } {
  const rpcCalls: unknown[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/auth/csrf')) {
      return jsonResponse({ csrf_token: 'test-csrf' });
    }
    if (url.includes('/api/data/rpc/change_task_status')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        p_target: TaskStatus;
        p_comment: string | null;
      };
      rpcCalls.push(body);
      return rpc(body.p_comment);
    }
    if (url.includes('/api/data/task_status_history')) {
      return jsonResponse(state.history);
    }
    if (url.includes('/api/data/tasks')) {
      return jsonResponse([
        {
          id: taskId,
          object_id: objectId,
          title: 'Монтаж окон',
          description: '',
          status: state.status,
          assignee_id: assigneeId,
          author_id: managerId,
          created_at: '2026-11-01T09:00:00Z',
          updated_at: '2026-11-04T12:00:00Z',
          archived_at: null,
        },
      ]);
    }
    if (url.includes('/api/data/profiles')) {
      return jsonResponse(profiles);
    }
    if (url.includes('/api/data/objects')) {
      return jsonResponse([{ id: objectId, title: 'ЖК Северный' }]);
    }
    return jsonResponse({ message: 'unexpected' }, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { rpcCalls };
}

function managerSession(): sessionModule.UseSessionResult {
  return {
    status: 'authenticated',
    email: null,
    profile: { id: managerId, full_name: 'Ирина Волкова', role: 'manager' },
    refresh: vi.fn(async () => undefined),
  };
}

function renderTask(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/tasks/${taskId}`]}>
        <Routes>
          <Route path="/tasks/:id" element={<TaskPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(authApi.supabase.auth.getSession).mockResolvedValue({
    data: { session: { access_token: 'jwt-token' } },
    error: null,
  } as never);
  vi.mocked(sessionModule.useSession).mockReturnValue(managerSession());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('StatusPanel', () => {
  it('A08.3 возврат с пустым комментарием не отправляется, поле подсвечено', async () => {
    const state: State = {
      status: 'on_review',
      history: [historyRow(1, null, 'new', managerId, '2026-11-01T09:00:00Z')],
    };
    const { rpcCalls } = setupFetch(state, () => jsonResponse('rework'));
    renderTask();

    fireEvent.click(await screen.findByRole('button', { name: 'На доработку' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(await screen.findByText('Опишите, что доработать')).toBeTruthy();
    const field = screen.getByLabelText('Что доработать');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(rpcCalls).toHaveLength(0);
  });

  it('A08.4 успешный возврат с комментарием: статус rework и комментарий первой строкой истории', async () => {
    const state: State = {
      status: 'on_review',
      history: [historyRow(1, null, 'new', managerId, '2026-11-01T09:00:00Z')],
    };
    const { rpcCalls } = setupFetch(state, (comment) => {
      state.status = 'rework';
      state.history = [
        historyRow(2, 'on_review', 'rework', managerId, '2026-11-04T12:00:00Z', comment),
        ...state.history,
      ];
      return jsonResponse('rework');
    });
    renderTask();

    fireEvent.click(await screen.findByRole('button', { name: 'На доработку' }));
    fireEvent.change(screen.getByLabelText('Что доработать'), {
      target: { value: 'Поправить швы' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    await waitFor(() => expect(rpcCalls).toHaveLength(1));
    expect(rpcCalls[0]).toEqual({
      p_task_id: taskId,
      p_target: 'rework',
      p_comment: 'Поправить швы',
    });

    await waitFor(() => expect(screen.getAllByText('На доработке').length).toBeGreaterThan(0));
    const list = screen.getByRole('list', { name: 'История переходов' });
    const first = within(list).getAllByRole('listitem')[0];
    expect(first?.textContent).toContain('Поправить швы');
  });

  it('A08.5 прямой вызов запрещённого перехода возвращает ошибку и не меняет статус', async () => {
    const state: State = {
      status: 'accepted',
      history: [historyRow(2, 'on_review', 'accepted', managerId, '2026-11-04T12:00:00Z')],
    };
    const { rpcCalls } = setupFetch(state, () =>
      jsonResponse({ code: 'P0422', message: 'transition_not_allowed' }, 400),
    );
    renderTask();

    await expect(changeTaskStatus(taskId, 'in_progress')).rejects.toMatchObject({
      message: 'Этот переход недоступен',
    });

    expect(rpcCalls).toHaveLength(1);
    expect(state.status).toBe('accepted');
    await waitFor(() => expect(screen.getAllByText('Принята').length).toBeGreaterThan(0));
  });

  it('DEC-058: после «Принять» кнопки переходов исчезают, статус зафиксирован', async () => {
    const state: State = {
      status: 'on_review',
      history: [historyRow(1, 'in_progress', 'on_review', assigneeId, '2026-11-04T10:00:00Z')],
    };
    setupFetch(state, () => {
      state.status = 'accepted';
      state.history = [
        historyRow(2, 'on_review', 'accepted', managerId, '2026-11-04T12:00:00Z'),
        ...state.history,
      ];
      return jsonResponse('accepted');
    });
    renderTask();

    fireEvent.click(await screen.findByRole('button', { name: 'Принять' }));

    await waitFor(() => {
      expect(screen.getByText('Статус зафиксирован. Дальнейшая смена недоступна.')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Принять' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'На доработку' })).toBeNull();
    expect(screen.getAllByText('Принята').length).toBeGreaterThan(0);
  });

  it('DEC-058: у уже принятой задачи нет кнопок смены статуса', async () => {
    const state: State = {
      status: 'accepted',
      history: [historyRow(2, 'on_review', 'accepted', managerId, '2026-11-04T12:00:00Z')],
    };
    setupFetch(state, () => jsonResponse({ code: 'P0422', message: 'transition_not_allowed' }, 400));
    renderTask();

    expect(await screen.findByText('Статус зафиксирован. Дальнейшая смена недоступна.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Принять' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'На доработку' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Взять в работу' })).toBeNull();
  });
});
