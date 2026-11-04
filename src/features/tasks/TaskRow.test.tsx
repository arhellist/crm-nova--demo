// @vitest-environment jsdom
/**
 * Тесты строки списка «Мои задачи»: переход в один клик и постраничная подгрузка.
 *
 * @acceptance A09.3
 * @acceptance A09.5
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MyTasksPage } from './MyTasksPage.js';
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
const assigneeId = '22222222-2222-4222-8222-222222222222';
const managerId = '11111111-1111-4111-8111-111111111111';

function taskRow(index: number, status: TaskStatus): TaskRow {
  const suffix = String(index).padStart(12, '0');
  return {
    id: `44444444-4444-4444-8444-${suffix}`,
    object_id: objectId,
    title: `Задача ${index}`,
    description: '',
    status,
    assignee_id: assigneeId,
    author_id: managerId,
    created_at: `2026-11-04T09:${String(index % 60).padStart(2, '0')}:00Z`,
    updated_at: '2026-11-04T12:00:00Z',
    archived_at: null,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface MockOptions {
  /** Сколько строк отдаёт вторая страница (всего задач — первая страница + это число). */
  secondPageFrom?: number;
  rpcBodies?: Array<Record<string, unknown>>;
}

function setupFetch(tasksInput: TaskRow[], options: MockOptions = {}): void {
  const tasks = tasksInput.map((task) => ({ ...task }));

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.includes('/rest/v1/rpc/change_task_status')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      options.rpcBodies?.push(body);
      const task = tasks.find((row) => row.id === body.p_task_id);
      if (task) {
        task.status = body.p_target as TaskStatus;
      }
      return jsonResponse(body.p_target);
    }

    if (url.includes('/rest/v1/tasks')) {
      const search = new URL(url).searchParams;
      if (search.get('select') === 'status') {
        return jsonResponse(tasks.map((row) => ({ status: row.status })));
      }
      const statusFilter = search.get('status');
      let rows = tasks;
      if (statusFilter?.startsWith('eq.')) {
        rows = rows.filter((row) => row.status === statusFilter.slice(3));
      }
      if (search.get('or') && options.secondPageFrom !== undefined) {
        rows = rows.slice(options.secondPageFrom);
      }
      const limit = Number(search.get('limit') ?? '20');
      return jsonResponse(rows.slice(0, limit));
    }

    if (url.includes('/rest/v1/objects')) {
      return jsonResponse([{ id: objectId, title: 'ЖК Северный' }]);
    }

    return jsonResponse({ message: 'unexpected' }, 500);
  });

  vi.stubGlobal('fetch', fetchMock);
}

function renderMyTasks(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/my']}>
        <Routes>
          <Route path="/my" element={<MyTasksPage />} />
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
  vi.mocked(sessionModule.useSession).mockReturnValue({
    status: 'authenticated',
    email: null,
    profile: { id: assigneeId, full_name: 'Пётр Смирнов', role: 'executor' },
    refresh: vi.fn(async () => undefined),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('TaskRow', () => {
  it('A09.3: «Взять в работу» из строки переводит задачу и переносит её во вкладку «В работе»', async () => {
    const rpcBodies: Array<Record<string, unknown>> = [];
    setupFetch([taskRow(1, 'new')], { rpcBodies });

    renderMyTasks();

    await waitFor(() => {
      expect(screen.getByText('Задача 1')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Взять в работу: Задача 1/ }));

    await waitFor(() => {
      expect(rpcBodies).toHaveLength(1);
    });
    expect(rpcBodies[0]?.p_target).toBe('in_progress');
    expect(rpcBodies[0]?.p_task_id).toBe(taskRow(1, 'new').id);

    // После успешного RPC список перечитан: группа «Новая» исчезла, задача в «В работе».
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Новая/ })).toBeNull();
    });
    expect(screen.getByRole('heading', { name: /В работе/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /В работе/ }));
    await waitFor(() => {
      expect(screen.getAllByRole('article')).toHaveLength(1);
    });
    expect(screen.getByText('Задача 1')).toBeTruthy();
    expect(screen.getAllByText('Задача 1')).toHaveLength(1);
  });

  it('A09.5: 25 задач — вкладка «Все» показывает «20+», подгрузка добавляет остальные без дублей', async () => {
    const tasks = Array.from({ length: 25 }, (_, index) => taskRow(index + 1, 'new'));
    setupFetch(tasks, { secondPageFrom: 20 });

    renderMyTasks();

    await waitFor(() => {
      expect(screen.getAllByRole('article')).toHaveLength(20);
    });

    const allTab = screen.getByRole('tab', { name: /Все/ });
    expect(within(allTab).getByText('20+')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));

    await waitFor(() => {
      expect(screen.getAllByRole('article')).toHaveLength(25);
    });

    const titles = screen.getAllByRole('article').map((node) => node.getAttribute('aria-label'));
    expect(new Set(titles).size).toBe(25);
    expect(within(allTab).getByText('25')).toBeTruthy();
  });
});
