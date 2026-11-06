/**
 * «Команда»: карточки KPI менеджеров и создание нового менеджера (DEC-060, DEC-061, DEC-063).
 *
 * Инварианты:
 *  - доступ к маршруту — RequireManager; страница не создаёт executor;
 *  - пароль показывают один раз после успеха; повторно с сервера не запрашивается;
 *  - пароль не уходит в console/аналитику из этого компонента;
 *  - статистика — агрегаты с реплики, без email (INV-011).
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createManager, type CreatedManager } from '../auth/api.js';
import { ManagerCards } from './ManagerCards.js';

export function TeamPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedManager | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setCreated(null);
    setCopied(false);
    try {
      const result = await createManager({
        email: email.trim(),
        full_name: fullName.trim(),
      });
      setCreated(result);
      setFullName('');
      setEmail('');
      await queryClient.invalidateQueries({ queryKey: ['reports', 'managers'] });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Не удалось создать учётную запись',
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyPassword(): Promise<void> {
    if (!created) {
      return;
    }
    try {
      await navigator.clipboard.writeText(created.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-labelledby="team-title" className="max-w-5xl">
      <h1 id="team-title" className="text-[28px] font-semibold tracking-tight text-text">
        Команда
      </h1>
      <p className="mt-2 text-sm text-text-dim">
        KPI менеджеров по назначенным задачам. Новый менеджер (учётка постановщика) получит
        одноразовый пароль — передайте его по защищённому каналу.
      </p>

      <ManagerCards />

      <form
        className="mt-10 max-w-xl space-y-5 rounded-md border border-stroke bg-panel p-6"
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        aria-labelledby="create-manager-title"
      >
        <h2 id="create-manager-title" className="text-lg font-semibold text-text">
          Добавить менеджера
        </h2>
        <div className="space-y-2">
          <label htmlFor="manager-full-name" className="block text-sm font-medium text-text">
            ФИО
          </label>
          <input
            id="manager-full-name"
            name="full_name"
            type="text"
            required
            maxLength={120}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="w-full rounded-sm border border-stroke-strong bg-bg-1 px-3 py-2.5 text-text"
            placeholder="Иван Иванов"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="manager-email" className="block text-sm font-medium text-text">
            Email
          </label>
          <input
            id="manager-email"
            name="email"
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-sm border border-stroke-strong bg-bg-1 px-3 py-2.5 text-text"
            placeholder="manager2@company.ru"
            autoComplete="off"
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
          className="rounded-sm bg-cyan px-4 py-2.5 text-sm font-semibold text-bg-0 transition hover:shadow-glow-cyan disabled:opacity-40"
        >
          {busy ? 'Создаём…' : 'Создать менеджера'}
        </button>
      </form>

      {created ? (
        <div
          role="status"
          className="mt-6 max-w-xl rounded-md border border-lime/40 bg-panel p-6"
          aria-live="polite"
        >
          <h2 className="text-lg font-semibold text-text">Учётная запись создана</h2>
          <p className="mt-1 text-sm text-text-dim">
            Сохраните пароль сейчас — повторно он не отобразится.
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-text-mute">ФИО</dt>
              <dd className="mt-1 text-text">{created.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-text-mute">Email</dt>
              <dd className="mt-1 font-mono text-text">{created.email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-text-mute">Пароль</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-3">
                <code className="rounded-sm border border-stroke bg-bg-1 px-3 py-2 font-mono text-sm text-text">
                  {created.password}
                </code>
                <button
                  type="button"
                  onClick={() => void copyPassword()}
                  className="rounded-sm border border-stroke px-3 py-2 text-sm text-text-dim transition hover:border-stroke-strong hover:text-text"
                >
                  {copied ? 'Скопировано' : 'Копировать'}
                </button>
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </section>
  );
}
