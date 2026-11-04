// @vitest-environment jsdom
/**
 * Тесты экрана «Мои задачи»: группировка и счётчики, изоляция исполнителей,
 * действия менеджера и пустое состояние.
 *
 * @acceptance A09.1
 * @acceptance A09.2
 * @acceptance A09.4
 * @acceptance A09.6
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
const otherId = '22222222-2222-4222-8222-999999999999';
const managerId = '11111111-1111-4111-8111-111111111111';

function taskRow(
  index: number,
  status: TaskStatus,
  assignee: string = assigneeId,
  title?: string,
): TaskRow {
  const suffix = String(index).padStart(12, '0');
  return {
    id: `44444444-4444-4444-8444-${suffix}`,
    object_id: objectId,
    title: title ?? `Задача ${index}`,
    description: '',
    status,
    assignee_id: assignee,
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
  tasks: TaskRow[];
  /** Статус после успешного RPC: по умолчанию `in_progress`. */
  rpcStatus?: TaskStatus;
  /** Смещение для второй страницы: имитирует keyset-курсор без разбора `or`. */
  secondPageFrom?: number;
  /** Кого пускает «RLS»: остальные строки сервер не отдаёт вовсе (A09.2). */
  viewerId?: string;
  onRequest?: (url: string) => void;
}

/** Подмена PostgREST: список, агрегат статусов, объекты и RPC перехода. */
function setupFetch(options: MockOptions): { rpcBodies: Array<Record<string, unknown>> } {
  const rpcBodies: Array<Record<string, unknown>> = [];
  const tasks = options.tasks.map((task) => ({ ...task }));

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    options.onRequest?.(url);

    if (url.includes('/rest/v1/rpc/change_task_status')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      rpcBodies.push(body);
      const target = body.p_target as TaskStatus;
      const task = tasks.find((row) => row.id === body.p_task_id);
      if (task) {
        task.status = options.rpcStatus ?? target;
      }
      return jsonResponse(options.rpcStatus ?? target);
    }

    if (url.includes('/rest/v1/tasks')) {
      const search = new URL(url).searchParams;
      const visible = tasks.filter(
        (row) =>
          row.archived_at === null &&
          (options.viewerId === undefined || row.assignee_id === options.viewerId),
      );
      if (search.get('select') === 'status') {
        return jsonResponse(visible.map((row) => ({ status: row.status })));
      }
      const filter = search.get('status');
      let rows = visible;
      if (filter?.startsWith('eq.')) {
        const wanted = filter.slice(3);
        rows = rows.filter((row) => row.status === wanted);
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
  return { rpcBodies };
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
  vi.mocked(sessionModule.useSession).mockReturnValue(sessionFor('executor'));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('MyTasksPage', () => {
  it('A09.1: исполнитель видит 6 задач, сгруппированных по статусам, счётчики совпадают', async () => {
    setupFetch({
      tasks: [
        taskRow(1, 'new'),
        taskRow(2, 'new'),
        taskRow(3, 'in_progress'),
        taskRow(4, 'on_review'),
        taskRow(5, 'rework'),
        taskRow(6, 'accepted'),
      ],
    });

    renderMyTasks();

    await waitFor(() => {
      expect(screen.getAllByRole('article')).toHaveLength(6);
    });

    for (let index = 1; index <= 6; index += 1) {
      expect(screen.getByText(`Задача ${index}`)).toBeTruthy();
    }

    // Группы идут в порядке цикла статусов, пустых групп нет.
    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
    expect(headings).toHaveLength(5);
    expect(headings[0]).toContain('Новая');
    expect(headings[4]).toContain('Принята');

    const expectTabCount = async (label: RegExp, count: string): Promise<void> => {
      const tab = screen.getByRole('tab', { name: label });
      await waitFor(() => {
        expect(within(tab).getByText(count)).toBeTruthy();
      });
    };

    await expectTabCount(/Все/, '6');
    await expectTabCount(/Новые/, '2');
    await expectTabCount(/В работе/, '1');
    await expectTabCount(/На проверке/, '1');
    await expectTabCount(/На доработке/, '1');
    await expectTabCount(/Принятые/, '1');
  });

  it('A09.2: задачи другого исполнителя не видны, фильтр assignee_id не передаётся', async () => {
    const urls: string[] = [];
    setupFetch({
      tasks: [
        taskRow(1, 'new', assigneeId, 'Моя задача'),
        taskRow(2, 'in_progress', otherId, 'Чужая задача'),
      ],
      viewerId: assigneeId,
      onRequest: (url) => urls.push(url),
    });

    renderMyTasks();

    await waitFor(() => {
      expect(screen.getByText('Моя задача')).toBeTruthy();
    });

    expect(screen.queryByText('Чужая задача')).toBeNull();
    // Клиент не пытается ограничить выборку сам: видимость задаёт RLS.
    expect(urls.some((url) => url.includes('assignee_id=eq'))).toBe(false);

    // Проверка после переключения вкладки: фильтр по статусу не добавляет assignee_id.
    fireEvent.click(screen.getByRole('tab', { name: /Новые/ }));
    await waitFor(() => {
      expect(screen.getByText('Моя задача')).toBeTruthy();
    });
    expect(urls.some((url) => url.includes('assignee_id=eq'))).toBe(false);
    expect(urls.some((url) => url.includes('status=eq.new'))).toBe(true);
  });

  it('A09.4: менеджер видит приёмку и возврат, счётчик «На проверке» учитывает задачу', async () => {
    vi.mocked(sessionModule.useSession).mockReturnValue(sessionFor('manager'));
    setupFetch({ tasks: [taskRow(1, 'on_review')] });

    renderMyTasks();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Принять/ })).toBeTruthy();
    });
    expect(screen.getByRole('link', { name: /На доработку/ })).toBeTruthy();

    const tab = screen.getByRole('tab', { name: /На проверке/ });
    await waitFor(() => {
      expect(within(tab).getByText('1')).toBeTruthy();
    });
  });

  it('A09.6: пустой список показывает подсказку и нулевые счётчики', async () => {
    setupFetch({ tasks: [] });

    renderMyTasks();

    await waitFor(() => {
      expect(screen.getByText('Задач нет')).toBeTruthy();
    });
    expect(screen.getByText(/Здесь появятся задачи, назначенные на вас/)).toBeTruthy();
    expect(screen.queryAllByRole('article')).toHaveLength(0);

    for (const label of [/Все/, /Новые/, /В работе/, /На проверке/, /На доработке/, /Принятые/]) {
      const tab = screen.getByRole('tab', { name: label });
      expect(within(tab).getByText('0')).toBeTruthy();
    }
  });
});
