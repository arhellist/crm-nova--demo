// @vitest-environment jsdom
/**
 * Тесты оболочки: навигация по роли, восстановление экрана после F5 без токенов в URL.
 *
 * @acceptance A04.3
 * @acceptance A04.6
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './router.js';
import type { Profile } from '../features/auth/api.js';
import * as api from '../features/auth/api.js';

vi.mock('../features/auth/api', () => ({
  getSession: vi.fn(),
    getProfile: vi.fn(),
  refreshSession: vi.fn(),
  onAuthChange: vi.fn(() => () => undefined),
  isUnauthorized: (error: unknown) =>
    typeof error === 'object' && error !== null && (error as { status?: number }).status === 401,
  signIn: vi.fn(),
    signOut: vi.fn(),
}));

const executor: Profile = {
  id: '22222222-2222-4222-8222-222222222222',
  full_name: 'Пётр Смирнов',
  role: 'executor',
};

const manager: Profile = {
  id: '11111111-1111-4111-8111-111111111111',
  full_name: 'Ирина Волкова',
  role: 'manager',
};

const session = { user: { id: executor.id, email: 'executor1@nova.local' } };

function renderAt(path: string): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.getSession).mockResolvedValue(session);
  vi.mocked(api.getProfile).mockResolvedValue(executor);
  vi.mocked(api.refreshSession).mockResolvedValue(undefined);
  vi.mocked(api.onAuthChange).mockReturnValue(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AppShell', () => {
  it('A04.3 исполнитель: нет пунктов «Отчёты» и «Команда», роль из profiles', async () => {
    renderAt('/my');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Мои задачи' })).toBeTruthy(),
    );
    expect(screen.getByRole('link', { name: 'Объекты' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Мои задачи' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Отчёты' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Команда' })).toBeNull();
    expect(screen.getByText('Пётр Смирнов')).toBeTruthy();
    expect(screen.getByText('Исполнитель')).toBeTruthy();
  });

  it('A04.6 F5 на /my: сессия и экран восстановлены, токенов в URL нет', async () => {
    renderAt('/my');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Мои задачи' })).toBeTruthy(),
    );
    // Сессия восстанавливается из supabase-js; экран «Мои задачи» читает её же для роли,
    // поэтому счётчик вызовов не фиксируем — важны восстановленный экран и чистый URL.
    expect(api.getSession).toHaveBeenCalled();
    expect(window.location.search).toBe('');
    expect(window.location.href).not.toContain('access_token');
    expect(window.location.href).not.toContain('refresh_token');
  });

  it('A04.3 / DEC-060 manager видит «Отчёты» и «Команда»', async () => {
    vi.mocked(api.getProfile).mockResolvedValue(manager);
    renderAt('/my');

    await waitFor(() => expect(screen.getByRole('link', { name: 'Отчёты' })).toBeTruthy());
    expect(screen.getByRole('link', { name: 'Команда' })).toBeTruthy();
    expect(screen.getByText('Менеджер')).toBeTruthy();
  });
});
