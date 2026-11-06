/** @vitest-environment jsdom */
/**
 * Тесты сессии: восстановление после F5, редирект анонима (DEC-053 без MFA).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSession } from './useSession.js';
import * as api from './api.js';

vi.mock('./api.js', () => ({
  getSession: vi.fn(),
  getProfile: vi.fn(),
  getAssurance: vi.fn(),
  refreshSession: vi.fn(),
  isUnauthorized: (error: unknown) =>
    typeof error === 'object' && error !== null && 'status' in error && (error as { status: number }).status === 401,
  onAuthChange: vi.fn(() => () => undefined),
}));

const profile = {
  id: '11111111-1111-4111-8111-111111111111',
  full_name: 'Manager',
  role: 'manager' as const,
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useSession', () => {
  beforeEach(() => {
    vi.mocked(api.getSession).mockReset();
    vi.mocked(api.getProfile).mockReset();
  });

  it('A04.4: после F5 сессия восстанавливается по cookie-сессии BFF', async () => {
    vi.mocked(api.getSession).mockResolvedValue({
      user: { id: profile.id, email: 'manager@nova.local' },
    });
    vi.mocked(api.getProfile).mockResolvedValue(profile);

    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.profile?.role).toBe('manager');
  });

  it('A04.2: нет сессии → anonymous', async () => {
    vi.mocked(api.getSession).mockResolvedValue(null);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
  });
});
