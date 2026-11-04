// @vitest-environment jsdom
/**
 * A12.4, A12.5 — деградация реплики не блокирует продукт, лишние поля не попадают в UI.
 *
 * 503 приходит от backend D11, клиент переводит его в `ReplicaUnavailable`; экран показывает
 * локальную панель с «Повторить», а навигация продолжает работать. Ответ с `email`
 * внутри строки отчёта проходит Zod-фильтр: в DOM нет ни поля, ни его значения.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
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

beforeEach(() => {
  vi.stubEnv('VITE_REPORT_API_URL', REPORT_URL);
  vi.stubEnv('VITE_REPORT_API_TOKEN', 'public-reports-token');
  resetReportApiForTests();
  vi.mocked(useSession).mockReturnValue(managerSession());
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  resetReportApiForTests();
});

describe('A12.4 деградация реплики', () => {
  it('A12.4 при 503 показывает панель и повторяет запрос, навигация работает', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/reports/')) {
        return jsonResponse(
          { error: { code: 'E_REPLICA_DOWN', message: 'Реплика недоступна' } },
          503,
          { 'retry-after': '30' },
        );
      }
      // PostgREST «Моих задач» тоже недоступен: экран обязан отрисоваться и показать ошибку.
      return jsonResponse({ code: 'P0400', message: 'unavailable' }, 503);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5_000 });
    expect(alerts.some((node) => node.textContent?.includes('Отчёты временно недоступны'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy();
    const callsBeforeRetry = fetchMock.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
    });

    // Переход на «Мои задачи» не блокируется деградацией отчётов.
    fireEvent.click(screen.getByRole('link', { name: 'Мои задачи' }));
    expect(await screen.findByRole('heading', { name: 'Мои задачи' })).toBeTruthy();
  });
});

describe('A12.5 поля вне контракта', () => {
  it('A12.5 email, description и comment не отображаются и не дают ошибок', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          source: 'replica',
          lag_seconds: 1,
          generated_at: '2026-11-04T12:00:00.000Z',
          data: [
            {
              object_id: '11111111-1111-4111-8111-111111111111',
              title: 'ЖК Северный',
              address: 'г. Москва, ул. Строителей, 1',
              tasks_total: 1,
              tasks_new: 1,
              tasks_in_progress: 0,
              tasks_on_review: 0,
              tasks_rework: 0,
              tasks_accepted: 0,
              accepted_share: 0,
              last_activity_at: null,
              // Поля вне openapi: Zod отбрасывает их до рендера.
              email: 'secret@example.test',
              description: 'Скрытое описание',
              comment: 'Скрытый комментарий',
            },
          ],
        }),
      ),
    );

    renderPage();

    expect(await screen.findByText('ЖК Северный')).toBeTruthy();
    expect(document.body.textContent).not.toContain('secret@example.test');
    expect(document.body.textContent).not.toContain('Скрытое описание');
    expect(document.body.textContent).not.toContain('Скрытый комментарий');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
