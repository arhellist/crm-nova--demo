/**
 * Маршрутизация и guard'ы NOVA CRM (DEC-053: без MFA-gate).
 *
 * Инварианты:
 *  - аноним на защищённом пути → /login;
 *  - авторизованный на /login → /;
 *  - роль из profiles через useSession (INV-005).
 */
import { Route, Routes, Navigate, Outlet, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { LoginPage } from '../features/auth/LoginPage.js';
import { useSession } from '../features/auth/useSession.js';
import { AppShell } from './AppShell.js';
import { ObjectsPage } from '../features/objects/ObjectsPage.js';
import { TaskPage } from '../features/tasks/TaskPage.js';
import { MyTasksPage } from '../features/tasks/MyTasksPage.js';
import { ReportsPage } from '../features/reports/ReportsPage.js';
import { TeamPage } from '../features/team/TeamPage.js';

function LoadingScreen(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-0">
      <p role="status" className="text-text-dim">
        Загрузка…
      </p>
    </div>
  );
}

function ProtectedShell(): JSX.Element {
  const session = useSession();
  const location = useLocation();

  if (session.status === 'loading') {
    return <LoadingScreen />;
  }
  if (session.status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <AppShell session={session} />;
}

function PublicOnly(): JSX.Element {
  const session = useSession();

  if (session.status === 'loading') {
    return <LoadingScreen />;
  }
  if (session.status === 'authenticated') {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function RequireManager({ children }: { children: ReactElement }): JSX.Element {
  const session = useSession();
  if (session.status === 'loading') {
    return <LoadingScreen />;
  }
  if (session.status !== 'authenticated') {
    return <Navigate to="/login" replace />;
  }
  if (session.profile?.role !== 'manager') {
    return <NotFoundBlock />;
  }
  return children;
}

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

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route
          path="/login"
          element={
            <LoginPage
              onAuthenticated={() => {
                window.location.assign(`${import.meta.env.BASE_URL.replace(/\/?$/, '/')}`);
              }}
            />
          }
        />
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
        <Route
          path="/team"
          element={
            <RequireManager>
              <TeamPage />
            </RequireManager>
          }
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
