// @vitest-environment jsdom
/**
 * A12.1, A12.2, A12.3 — экран отчётов для менеджера: три вкладки, лаг и запрет доступа.
 *
 * Сеть подменена `fetch`: клиент отчётов работает по-настоящему, включая Zod-валидацию.
 * Исполнитель проверяется через полное дерево маршрутов, чтобы 404 и отсутствие пункта
 * навигации доказывались вместе (A12.2).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ReportsPage } from './ReportsPage.js';
import { resetReportApiForTests } from './api.js';
import { AppRoutes } from '../../app/router.js';
import { useSession } from '../auth/useSession.js';
import type { UseSessionResult } from '../auth/useSession.js';

vi.mock('../auth/api.js', () => ({
  supabase: { auth: { getSession: vi.fn() } },
  supabaseUrl: 'https://db.nova.test',
  supabaseAnonKey: 'anon-key',
  signOut: vi.fn(async () => undefined),
}));

vi.mock('../auth/useSession.js', () => ({
  useSession: vi.fn(),
}));

const REPORT_URL = 'https://reports.nova.test';
const OBJECT_ID = '11111111-1111-4111-8111-111111111111';
const ASSIGNEE_ID = '22222222-2222-4222-8222-222222222222';

const OBJECT_ROW = {
  object_id: OBJECT_ID,
  title: 'ЖК Северный',
  address: 'г. Москва, ул. Строителей, 1',
  tasks_total: 4,
  tasks_new: 0,
  tasks_in_progress: 2,
  tasks_on_review: 1,
  tasks_rework: 0,
  tasks_accepted: 1,
  accepted_share: 25,
  last_activity_at: '2026-11-01T09:00:00.000Z',
};

const WORKLOAD_ROW = {
  assignee_id: ASSIGNEE_ID,
  full_name: 'Анна Смирнова',
  tasks_total: 3,
  tasks_in_progress: 2,
  tasks_on_review: 1,
  tasks_rework: 0,
  tasks_accepted: 0,
  oldest_open_at: '2026-10-30T08:00:00.000Z',
};

const STATUS_AGE_ROW = {
  day: '2026-11-01',
  avg_seconds_in_status: 7200,
  max_seconds_in_status: 86_400,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function envelope(data: unknown[], lag: number): unknown {
  return {
    source: 'replica',
    lag_seconds: lag,
    generated_at: '2026-11-04T12:00:00.000Z',
    data,
  };
}

/** Подмена трёх отчётов: тело зависит от пути, лаг общий для всех ответов. */
function setupFetch(lag: number): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/reports/objects')) return jsonResponse(envelope([OBJECT_ROW], lag));
    if (url.includes('/api/reports/workload')) return jsonResponse(envelope([WORKLOAD_ROW], lag));
    if (url.includes('/api/reports/status-ages')) return jsonResponse(envelope([STATUS_AGE_ROW], lag));
    return jsonResponse({ error: { code: 'E_NOT_FOUND', message: 'нет' } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function managerSession(): UseSessionResult {
  return {
    status: 'authenticated',
    email: 'manager@nova.test',
    profile: {
      id: '33333333-3333-4333-8333-333333333333',
      full_name: 'Ольга Руководитель',
      role: 'manager',
    },
    refresh: async () => undefined,
  };
}

function executorSession(): UseSessionResult {
  return {
    status: 'authenticated',
    email: 'executor@nova.test',
    profile: {
      id: '44444444-4444-4444-8444-444444444444',
      full_name: 'Пётр Исполнитель',
      role: 'executor',
    },
    refresh: async () => undefined,
  };
}

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/reports']}>
        <ReportsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderApp(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/reports']}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubEnv('VITE_REPORT_API_URL', REPORT_URL);
  vi.stubEnv('VITE_REPORT_API_TOKEN', 'public-reports-token');
  resetReportApiForTests();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  resetReportApiForTests();
});

describe('A12.1 / A12.3 экран отчётов менеджера', () => {
  it('A12.1 показывает три вкладки, данные и бейдж актуальности с лагом', async () => {
    setupFetch(2);
    vi.mocked(useSession).mockReturnValue(managerSession());
    renderPage();

    expect(screen.getByRole('tab', { name: 'Объекты' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Загрузка' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Возраст статусов' })).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('ЖК Северный')).toBeTruthy();
    });
    const badge = screen.getByRole('status');
    expect(badge.textContent).toContain('Данные на реплике');
    expect(badge.textContent).toContain('лаг 2 с');

    fireEvent.click(screen.getByRole('tab', { name: 'Загрузка' }));
    await waitFor(() => {
      expect(screen.getByText('Анна Смирнова')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Возраст статусов' }));
    await waitFor(() => {
      const panel = screen.getByRole('tabpanel');
      expect(within(panel).getByText('01.11.2026')).toBeTruthy();
      expect(within(panel).getByText('2 ч')).toBeTruthy();
    });
  });

  it('A12.3 при лаге 40 с показывает предупреждение и не скрывает данные', async () => {
    setupFetch(40);
    vi.mocked(useSession).mockReturnValue(managerSession());
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('ЖК Северный')).toBeTruthy();
    });
    const badge = screen.getByRole('status');
    expect(badge.textContent).toContain('лаг 40 с');
    expect(badge.textContent).toContain('данные устарели');
    // Данные при устаревшей реплике всё равно видны (A12.3).
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('A12.2 исполнитель видит 404 и не видит пункт «Отчёты»', async () => {
    const fetchMock = setupFetch(2);
    vi.mocked(useSession).mockReturnValue(executorSession());
    renderApp();

    expect(await screen.findByText('Страница не найдена')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Отчёты' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Мои задачи' })).toBeTruthy();
    // До отчётов исполнитель не дошёл: защищённые данные не запрашивались (A12.2).
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/reports/'),
      expect.anything(),
    );
  });
});
