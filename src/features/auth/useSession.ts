/**
 * Состояние сессии для guard'ов и оболочки.
 *
 * Почему так:
 *  - статус определяется по данным Auth и `profiles`, а не по claim `role` (INV-005);
 *  - `mfa_required` — сессия есть, но assurance ниже aal2: manager без TOTP в приложение
 *    не попадает (ADR-0005);
 *  - профиль кэшируется TanStack Query по ключу `['profile', uid]`; при 401 выполняется
 *    ровно один `refreshSession()` и повтор запроса, поэтому форма не теряется (A04.4);
 *  - выход очищает кэш профиля и защищённые данные из памяти.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Profile } from './api.js';
import {
  getAssurance,
  getProfile,
  getSession,
  isUnauthorized,
  onAuthChange,
  refreshSession,
} from './api.js';

export type SessionStatus = 'loading' | 'anonymous' | 'mfa_required' | 'authenticated';

export interface SessionState {
  status: SessionStatus;
  profile: Profile | null;
  email: string | null;
}

export interface UseSessionResult extends SessionState {
  /** Перечитать сессию после входа/MFA или выхода. */
  refresh: () => Promise<void>;
}

const initialState: SessionState = { status: 'loading', profile: null, email: null };

/**
 * Один refresh при истёкшем токене. Ошибка пробрасывается, чтобы guard увёл на /login,
 * а не показывал половину интерфейса.
 */
async function loadProfileWithRefresh(): Promise<Profile> {
  try {
    return await getProfile();
  } catch (error) {
    if (!isUnauthorized(error)) {
      throw error;
    }
    await refreshSession();
    return await getProfile();
  }
}

export function useSession(): UseSessionResult {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>(initialState);
  const activeRef = useRef(true);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const session = await getSession();
      if (!session) {
        queryClient.removeQueries({ queryKey: ['profile'] });
        if (activeRef.current) {
          setState({ status: 'anonymous', profile: null, email: null });
        }
        return;
      }

      const assurance = await getAssurance();
      if (assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
        if (activeRef.current) {
          setState({
            status: 'mfa_required',
            profile: null,
            email: session.user.email ?? null,
          });
        }
        return;
      }

      const profile = await queryClient.fetchQuery({
        queryKey: ['profile', session.user.id],
        queryFn: loadProfileWithRefresh,
        staleTime: 60_000,
      });

      if (activeRef.current) {
        setState({ status: 'authenticated', profile, email: session.user.email ?? null });
      }
    } catch {
      if (activeRef.current) {
        setState({ status: 'anonymous', profile: null, email: null });
      }
    }
  }, [queryClient]);

  useEffect(() => {
    activeRef.current = true;
    void refresh();

    const unsubscribe = onAuthChange((event) => {
      if (event === 'SIGNED_OUT') {
        queryClient.removeQueries({ queryKey: ['profile'] });
        if (activeRef.current) {
          setState({ status: 'anonymous', profile: null, email: null });
        }
        return;
      }
      void refresh();
    });

    return () => {
      activeRef.current = false;
      unsubscribe();
    };
  }, [queryClient, refresh]);

  return { ...state, refresh };
}
