/**
 * Состояние сессии для guard'ов и оболочки (DEC-053: без MFA, cookies через BFF).
 *
 *  - роль из `profiles` через `/api/auth/me` (INV-005);
 *  - при 401 на профиле — один refresh внутри apiFetch, затем повтор / разлогин.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Profile } from './api.js';
import { getProfile, getSession, isUnauthorized, onAuthChange } from './api.js';

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated';

export interface SessionState {
  status: SessionStatus;
  profile: Profile | null;
  email: string | null;
}

export interface UseSessionResult extends SessionState {
  refresh: () => Promise<void>;
}

const initialState: SessionState = { status: 'loading', profile: null, email: null };

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

      const profile = await queryClient.fetchQuery({
        queryKey: ['profile', session.user.id],
        queryFn: getProfile,
        staleTime: 60_000,
      });

      if (activeRef.current) {
        setState({
          status: 'authenticated',
          profile,
          email: session.user.email,
        });
      }
    } catch (error) {
      if (isUnauthorized(error)) {
        if (activeRef.current) {
          setState({ status: 'anonymous', profile: null, email: null });
        }
        return;
      }
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
