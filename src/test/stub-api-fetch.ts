/**
 * Заглушка fetch для тестов Data Gateway: отвечает на CSRF и делегирует остальное.
 */
import { vi } from 'vitest';

export function stubApiFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/auth/csrf')) {
      return new Response(JSON.stringify({ csrf_token: 'test-csrf' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return handler(url, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
