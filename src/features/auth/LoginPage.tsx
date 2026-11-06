/**
 * Экран входа: email + пароль без TOTP (DEC-053).
 *
 * Инварианты:
 *  - единый текст ошибки без user enumeration (INV-007);
 *  - открытой регистрации нет;
 *  - сессия выставляется BFF в httpOnly cookies.
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { signInWithPassword } from './api.js';

export interface LoginPageProps {
  onAuthenticated?: () => void | Promise<void>;
}

export function LoginPage({ onAuthenticated }: LoginPageProps): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithPassword(email, password);
      await onAuthenticated?.();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не удалось выполнить вход');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-0 px-4">
      <section
        aria-labelledby="login-title"
        className="w-full max-w-md rounded-lg border border-stroke bg-panel p-8"
      >
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan">NOVA CRM</p>
        <h1 id="login-title" className="mt-2 text-[28px] font-semibold tracking-tight text-text">
          Вход в систему
        </h1>
        <p className="mt-2 text-sm text-text-dim">
          Доступ выдаёт администратор. Самостоятельная регистрация отключена.
        </p>

        <form className="mt-8 space-y-5" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <div className="space-y-2">
            <label htmlFor="login-email" className="block text-sm font-medium text-text">
              Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-sm border border-stroke-strong bg-bg-1 px-3 py-2.5 text-text placeholder:text-text-mute"
              placeholder="name@company.ru"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="login-password" className="block text-sm font-medium text-text">
              Пароль
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-sm border border-stroke-strong bg-bg-1 px-3 py-2.5 text-text"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-rose">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 w-full rounded-sm bg-cyan px-4 py-2.5 font-semibold text-bg-0 transition hover:shadow-glow-cyan disabled:opacity-40"
          >
            Войти
          </button>
        </form>
      </section>
    </div>
  );
}
