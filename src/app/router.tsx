/**
 * Маршрутизация и guard'ы NOVA CRM.
 *
 * Инварианты:
 *  - аноним на любом защищённом пути получает redirect на /login и не запрашивает данные
 *    защищённого экрана (A04.2);
 *  - авторизованный на /login уводится на /, форма входа не показывается;
 *  - сессия с неполным MFA (manager без TOTP) видит только экран кода;
 *  - роль берётся из profiles через useSession, а не из JWT (INV-005).
 */
import { Route, Routes, Navigate, Outlet, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { LoginPage } from '../features/auth/LoginPage.js';
import { MfaChallenge } from '../features/auth/MfaChallenge.js';
import { signOut } from '../features/auth/api.js';
import { useSession } from '../features/auth/useSession.js';
import { AppShell } from './AppShell.js';
import { ObjectsPage } from '../features/objects/ObjectsPage.js';
import { TaskPage } from '../features/tasks/TaskPage.js';
import { MyTasksPage } from '../features/tasks/MyTasksPage.js';
import { ReportsPage } from '../features/reports/ReportsPage.js';

function LoadingScreen(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-0">
      <p role="status" className="text-text-dim">
        Загрузка…
      </p>
    </div>
  );
}

function MfaGate({ email, refresh }: { email: string | null; refresh: () => Promise<void> }): JSX.Element {
  return (
    <MfaChallenge
      email={email}
      onVerified={async () => {
        await refresh();
      }}
      onCancel={async () => {
        await signOut();
        await refresh();
      }}
    />
  );
}

/** Защищённые пути: до входа рендерится только /login. */
function ProtectedShell(): JSX.Element {
  const session = useSession();
  const location = useLocation();

  if (session.status === 'loading') {
    return <LoadingScreen />;
  }
  if (session.status === 'mfa_required') {
    return <MfaGate email={session.email} refresh={session.refresh} />;
  }
  if (session.status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <AppShell session={session} />;
}

/** Публичный /login: вошедшего пользователя отправляем в приложение. */
function PublicOnly(): JSX.Element {
  const session = useSession();

  if (session.status === 'loading') {
    return <LoadingScreen />;
  }
  if (session.status === 'mfa_required') {
    return <MfaGate email={session.email} refresh={session.refresh} />;
  }
  if (session.status === 'authenticated') {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

/**
 * Отчёты доступны только manager (A12.2).
 *
 * Исполнителю отдаётся 404-состояние, а не пустой экран и не редирект: существование
 * раздела для него не подтверждается, при этом навигация остаётся рабочей.
 */
function RequireManager({ children }: { children: ReactElement }): JSX.Element {
  const session = useSession();
  if (session.status !== 'authenticated') {
    return <Navigate to="/login" replace />;
  }
  if (session.profile?.role !== 'manager') {
    return <NotFoundBlock />;
  }
  return children;
}

/** 404-состояние внутри оболочки: используется и для чужих маршрутов, и для роли. */
function NotFoundBlock(): JSX.Element {
  return (
    <section className="flex min-h-[320px] flex-col items-center justify-center text-center">
      <p className="font-mono text-sm text-text-mute">404</p>
      <h1 className="mt-2 text-[28px] font-semibold text-text">Страница не найдена</h1>
      <a href="/" className="mt-4 inline-block text-cyan underline">
        Вернуться на главную
      </a>
    </section>
  );
}

function NotFoundPage(): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-0 px-4">
      <NotFoundBlock />
    </main>
  );
}

/** Дерево маршрутов без провайдеров — используется в тестах с MemoryRouter. */
export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedShell />}>
        <Route path="/" element={<Navigate to="/my" replace />} />
        <Route path="/my" element={<MyTasksPage />} />
        <Route path="/objects" element={<ObjectsPage />} />
        <Route path="/objects/:id" element={<ObjectsPage />} />
        <Route path="/tasks/:id" element={<TaskPage />} />
        <Route
          path="/reports"
          element={
            <RequireManager>
              <ReportsPage />
            </RequireManager>
          }
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
