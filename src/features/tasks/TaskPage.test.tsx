// @vitest-environment jsdom
/**
 * Тесты карточки задачи: кнопки переходов по роли, история и имена акторов.
 *
 * @acceptance A08.1
 * @acceptance A08.2
 * @acceptance A08.6
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TaskPage } from './TaskPage.js';
import type { TaskHistoryRow } from './useTask.js';
import type { TaskRow, TaskStatus } from './types.js';
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

function taskRow(status: TaskStatus): TaskRow {
  return {
    id: taskId,
    object_id: objectId,
    title: 'Монтаж окон',
    description: 'Второй этаж, секция Б',
    status,
    assignee_id: assigneeId,
    author_id: managerId,
    created_at: '2026-11-01T09:00:00Z',
    updated_at: '2026-11-04T12:00:00Z',
    archived_at: null,
  };
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

function setupFetch(status: TaskStatus, history: TaskHistoryRow[]): void {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/rest/v1/task_status_history')) {
      return jsonResponse(history);
    }
    if (url.includes('/rest/v1/tasks')) {
      return jsonResponse([taskRow(status)]);
    }
    if (url.includes('/rest/v1/profiles')) {
      return jsonResponse(profiles);
    }
    return jsonResponse({ message: 'unexpected' }, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
}

function sessionFor(role: 'manager' | 'executor'): sessionModule.UseSessionResult {
  return {
    status: 'authenticated',
    email: null,
    profile: {
      id: role === 'manager' ? managerId : assigneeId,
      full_name: role === 'manager' ? 'Ирина Волкова' : 'Пётр Смирнов',
      role,
    },
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
  vi.mocked(sessionModule.useSession).mockReturnValue(sessionFor('executor'));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('TaskPage', () => {
  it('A08.1 исполнитель на задаче new видит только «Взять в работу»', async () => {
    setupFetch('new', [historyRow(1, null, 'new', managerId, '2026-11-01T09:00:00Z')]);
    renderTask();

    expect(await screen.findByRole('button', { name: 'Взять в работу' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'На проверку' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Принять' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'На доработку' })).toBeNull();
  });

  it('A08.2 менеджер на задаче on_review видит «Принять» и «На доработку» без кнопок исполнителя', async () => {
    vi.mocked(sessionModule.useSession).mockReturnValue(sessionFor('manager'));
    setupFetch('on_review', [
      historyRow(2, 'in_progress', 'on_review', assigneeId, '2026-11-04T10:00:00Z'),
      historyRow(1, null, 'new', managerId, '2026-11-01T09:00:00Z'),
    ]);
    renderTask();

    expect(await screen.findByRole('button', { name: 'Принять' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'На доработку' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Взять в работу' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'На проверку' })).toBeNull();
  });

  it('A08.6 история из создания и четырёх переходов: 5 строк от новых к старым с именами', async () => {
    vi.mocked(sessionModule.useSession).mockReturnValue(sessionFor('manager'));
    setupFetch('in_progress', [
      historyRow(5, 'rework', 'in_progress', assigneeId, '2026-11-04T12:00:00Z'),
      historyRow(4, 'on_review', 'rework', managerId, '2026-11-04T11:00:00Z', 'Поправить швы'),
      historyRow(3, 'in_progress', 'on_review', assigneeId, '2026-11-04T10:00:00Z'),
      historyRow(2, 'new', 'in_progress', assigneeId, '2026-11-03T10:00:00Z'),
      historyRow(1, null, 'new', managerId, '2026-11-01T09:00:00Z'),
    ]);
    renderTask();

    const list = await screen.findByRole('list', { name: 'История переходов' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(5));

    const titles = within(list)
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '');
    expect(titles[0]).toContain('В работу');
    expect(titles[1]).toContain('На доработку');
    expect(titles[1]).toContain('Поправить швы');
    expect(titles[2]).toContain('На проверку');
    expect(titles[3]).toContain('В работу');
    expect(titles[4]).toContain('Создана');

    expect(within(list).getAllByText('Пётр Смирнов').length).toBeGreaterThan(0);
    expect(within(list).getAllByText('Ирина Волкова').length).toBeGreaterThan(0);
  });
});
