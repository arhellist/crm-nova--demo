// @vitest-environment jsdom
/**
 * Тесты сессии и guard'ов: восстановление после F5, редирект анонима, один refresh при 401.
 *
 * @acceptance A04.2
 * @acceptance A04.4
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../../app/router.js';
import { useSession } from './useSession.js';
import type { Profile } from './api.js';
import * as api from './api.js';

vi.mock('./api', () => ({
  getSession: vi.fn(),
  getAssurance: vi.fn(),
  getProfile: vi.fn(),
  refreshSession: vi.fn(),
  onAuthChange: vi.fn(() => () => undefined),
  isUnauthorized: (error: unknown) =>
    typeof error === 'object' && error !== null && (error as { status?: number }).status === 401,
  signIn: vi.fn(),
  verifyTotp: vi.fn(),
  signOut: vi.fn(),
}));

const profile: Profile = {
  id: '22222222-2222-4222-8222-222222222222',
  full_name: 'Пётр Смирнов',
  role: 'executor',
};

const session = {
  user: { id: profile.id, email: 'executor1@nova.local' },
};

function renderProbe(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Probe(): JSX.Element {
    const state = useSession();
    return <p data-testid="status">{state.status}</p>;
  }
  render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.getSession).mockResolvedValue(null);
  vi.mocked(api.getAssurance).mockResolvedValue({ currentLevel: 'aal1', nextLevel: 'aal1' });
  vi.mocked(api.getProfile).mockResolvedValue(profile);
  vi.mocked(api.refreshSession).mockResolvedValue(undefined);
  vi.mocked(api.onAuthChange).mockReturnValue(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useSession', () => {
  it('A04.2 аноним остаётся anonymous и не запрашивает профиль', async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    expect(api.getProfile).not.toHaveBeenCalled();
  });

  it('A04.4 истёкший токен: один refresh и повтор запроса профиля', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session);
    vi.mocked(api.getProfile)
      .mockRejectedValueOnce({ status: 401 })
      .mockResolvedValueOnce(profile);

    renderProbe();

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(api.refreshSession).toHaveBeenCalledTimes(1);
    expect(api.getProfile).toHaveBeenCalledTimes(2);
  });
});

describe('guard маршрутов', () => {
  it('A04.2 аноним на /objects видит форму входа, объекты не запрашиваются', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/objects']}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Вход в систему' })).toBeTruthy(),
    );
    expect(screen.queryByRole('heading', { name: 'Объекты' })).toBeNull();
    expect(api.getProfile).not.toHaveBeenCalled();
  });
});
