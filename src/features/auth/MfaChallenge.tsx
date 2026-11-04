/**
 * Экран второго фактора (TOTP).
 *
 * Зачем: manager без подтверждённого TOTP не должен попасть в приложение (ADR-0005).
 * Код не логируется и не уходит в URL; после успеха вызывается onVerified, который
 * перечитывает сессию. «Выйти» полностью очищает сессию, а не просто скрывает форму.
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { verifyTotp } from './api.js';

export interface MfaChallengeProps {
  email: string | null;
  onVerified: () => void | Promise<void>;
  onCancel: () => void | Promise<void>;
}

export function MfaChallenge({ email, onVerified, onCancel }: MfaChallengeProps): JSX.Element {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Введите шесть цифр из приложения-аутентификатора');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyTotp(code);
      await onVerified();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Не удалось проверить код',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(): Promise<void> {
    setBusy(true);
    try {
      await onCancel();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-0 px-4">
      <section
        aria-labelledby="mfa-title"
        className="w-full max-w-md rounded-lg border border-stroke bg-panel p-8 shadow-glow-violet"
      >
        <h1 id="mfa-title" className="text-[22px] font-semibold tracking-tight text-text">
          Подтверждение входа
        </h1>
        <p className="mt-2 text-sm text-text-dim">
          {email ? <>Введите код для {email}.</> : 'Введите код из приложения-аутентификатора.'}
        </p>

        <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <div>
            <label htmlFor="totp-code" className="block text-sm font-medium text-text">
              Код из приложения
            </label>
            <input
              id="totp-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.trim())}
              className="mt-2 w-full rounded-sm border border-stroke bg-bg-1 px-3 py-2 font-mono text-lg tracking-[0.4em] text-text"
              aria-invalid={error !== null}
              aria-describedby={error ? 'mfa-error' : undefined}
            />
          </div>

          {error ? (
            <p id="mfa-error" role="alert" className="text-sm text-rose">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-sm bg-cyan px-4 py-2 font-semibold text-bg-0 transition hover:shadow-glow-cyan disabled:opacity-40"
          >
            Подтвердить
          </button>
          <button
            type="button"
            onClick={() => void handleCancel()}
            disabled={busy}
            className="w-full rounded-sm border border-stroke px-4 py-2 text-text-dim transition hover:border-stroke-strong hover:text-text"
          >
            Выйти
          </button>
        </form>
      </section>
    </div>
  );
}
