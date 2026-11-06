// @vitest-environment jsdom
/**
 * UI «Команда»: создание менеджера и показ одноразового пароля (DEC-060).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamPage } from './TeamPage.js';
import * as api from '../auth/api.js';

vi.mock('../auth/api.js', () => ({
  createManager: vi.fn(),
}));

vi.mock('./ManagerCards.js', () => ({
  ManagerCards: () => <div>Карточки менеджеров</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TeamPage', () => {
  it('DEC-060: после создания показывает email и пароль', async () => {
    vi.mocked(api.createManager).mockResolvedValue({
      email: 'new-manager@nova.local',
      full_name: 'Новый Менеджер',
      password: 'TempPass!234567890ab',
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TeamPage />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText('ФИО'), { target: { value: 'Новый Менеджер' } });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'new-manager@nova.local' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Создать менеджера' }));

    await waitFor(() => {
      expect(screen.getByText('Учётная запись создана')).toBeTruthy();
    });
    expect(screen.getByText('new-manager@nova.local')).toBeTruthy();
    expect(screen.getByText('TempPass!234567890ab')).toBeTruthy();
    expect(api.createManager).toHaveBeenCalledWith({
      email: 'new-manager@nova.local',
      full_name: 'Новый Менеджер',
    });
  });
});
