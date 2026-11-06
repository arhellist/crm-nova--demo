// @vitest-environment jsdom
/**
 * Карточки /team: Анна и Пётр из workload, не role=manager (DEC-068).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ManagerCards } from './ManagerCards.js';
import * as reportsApi from '../reports/api.js';

vi.mock('../reports/api.js', async () => {
  const actual = await vi.importActual<typeof import('../reports/api.js')>('../reports/api.js');
  return {
    ...actual,
    getReportApi: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ManagerCards', () => {
  it('DEC-068: показывает Анну и Петра со счётчиками статусов из workload', async () => {
    vi.mocked(reportsApi.getReportApi).mockReturnValue({
      getReport: vi.fn(async () => ({
        source: 'replica' as const,
        lag_seconds: 0,
        generated_at: '2026-11-06T12:00:00Z',
        data: [
          {
            assignee_id: '33333333-3333-4333-8333-333333333333',
            full_name: 'Анна Ковалёва',
            tasks_total: 4,
            tasks_new: 1,
            tasks_in_progress: 1,
            tasks_on_review: 1,
            tasks_rework: 0,
            tasks_accepted: 1,
            oldest_open_at: '2026-10-30T16:34:10.033Z',
          },
          {
            assignee_id: '22222222-2222-4222-8222-222222222222',
            full_name: 'Пётр Смирнов',
            tasks_total: 4,
            tasks_new: 1,
            tasks_in_progress: 1,
            tasks_on_review: 0,
            tasks_rework: 1,
            tasks_accepted: 1,
            oldest_open_at: '2026-10-28T16:34:10.033Z',
          },
        ],
      })),
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ManagerCards />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Менеджеры' })).toBeTruthy();
    expect(screen.queryByText('Ирина Волкова')).toBeNull();
    expect(screen.queryByText('Тест Менеджеров')).toBeNull();

    const anna = screen.getByLabelText('Менеджер Анна Ковалёва');
    expect(anna.textContent).toContain('Новая');
    await waitFor(() => expect(anna.textContent).toContain('4'));

    const petr = screen.getByLabelText('Менеджер Пётр Смирнов');
    expect(petr.textContent).toContain('Пётр Смирнов');
  });
});
