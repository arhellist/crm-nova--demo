// @vitest-environment jsdom
/**
 * Тесты экрана входа: переход к TOTP без перезагрузки и отсутствие открытой регистрации.
 *
 * @acceptance A04.1
 * @acceptance A04.5
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LoginPage } from './LoginPage.js';
import * as api from './api.js';

vi.mock('./api', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  verifyTotp: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LoginPage', () => {
  it('A04.1 manager с TOTP: после пароля показывается запрос кода', async () => {
    vi.mocked(api.signIn).mockResolvedValue({ mfaRequired: true });
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'manager@nova.local' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'nova-local-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByRole('heading', { name: 'Подтверждение входа' })).toBeTruthy();
    expect(screen.getByLabelText('Код из приложения')).toBeTruthy();
    expect(screen.queryByLabelText('Пароль')).toBeNull();
  });

  it('A04.5 открытая регистрация отсутствует: нет формы и вызова signUp', () => {
    render(<LoginPage />);

    expect(screen.queryByRole('button', { name: /регистрац/i })).toBeNull();
    expect(screen.queryByText(/зарегистрироваться/i)).toBeNull();
    expect('signUp' in api).toBe(false);
  });
});
