/** @vitest-environment jsdom */
/**
 * Тесты экрана входа без TOTP (DEC-053).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LoginPage } from './LoginPage.js';
import * as api from './api.js';

vi.mock('./api.js', () => ({
  signInWithPassword: vi.fn(),
  signIn: vi.fn(),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(api.signInWithPassword).mockReset();
    vi.mocked(api.signIn).mockImplementation(api.signInWithPassword);
  });

  it('A04.1 / DEC-053: верный пароль входит без MFA', async () => {
    const onAuthenticated = vi.fn();
    vi.mocked(api.signInWithPassword).mockResolvedValue({ mfaRequired: false });

    render(<LoginPage onAuthenticated={onAuthenticated} />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'manager@nova.local' },
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: 'nova-local-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() => expect(api.signInWithPassword).toHaveBeenCalled());
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalled());
    expect(screen.queryByText(/код|TOTP|Authenticator/i)).toBeNull();
  });
});
