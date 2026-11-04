/**
 * Оболочка приложения: шапка, навигация по роли и выход.
 *
 * Инварианты:
 *  - пункт «Отчёты» рендерится только manager; у executor его нет в DOM, а не скрыт CSS
 *    (INV-005, A04.3);
 *  - имя и роль берутся из профиля (`profiles`), email в оболочке не показываем;
 *  - выход отзывает сессию и чистит кэш профиля через session.refresh().
 */
import { NavLink, Outlet } from 'react-router-dom';
import type { UseSessionResult } from '../features/auth/useSession.js';
import { signOut } from '../features/auth/api.js';

const roleLabel: Record<'manager' | 'executor', string> = {
  manager: 'Постановщик',
  executor: 'Исполнитель',
};

const navLinkClass = ({ isActive }: { isActive: boolean }): string =>
  [
    'rounded-sm px-3 py-2 text-sm transition',
    isActive ? 'bg-bg-2 text-text shadow-glow-cyan' : 'text-text-dim hover:text-text',
  ].join(' ');

export interface AppShellProps {
  session: UseSessionResult;
}

export function AppShell({ session }: AppShellProps): JSX.Element | null {
  if (!session.profile) {
    return null;
  }

  const { profile } = session;

  async function handleSignOut(): Promise<void> {
    try {
      await signOut();
    } finally {
      await session.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-bg-0">
      <header className="border-b border-stroke bg-panel-solid">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-4 px-6 py-3">
          <span className="font-mono text-sm font-semibold tracking-[0.2em] text-cyan">
            NOVA CRM
          </span>

          <nav aria-label="Основная навигация" className="flex items-center gap-1">
            <NavLink to="/objects" className={navLinkClass}>
              Объекты
            </NavLink>
            <NavLink to="/my" className={navLinkClass}>
              Мои задачи
            </NavLink>
            {profile.role === 'manager' ? (
              <NavLink to="/reports" className={navLinkClass}>
                Отчёты
              </NavLink>
            ) : null}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm text-text">{profile.full_name}</p>
              <p className="text-xs text-text-mute">{roleLabel[profile.role]}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="rounded-sm border border-stroke px-3 py-1.5 text-sm text-text-dim transition hover:border-rose hover:text-rose"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
