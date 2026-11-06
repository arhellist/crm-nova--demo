/**
 * @acceptance DEC-053 CSRF: Origin allowlist и double-submit.
 */
import { describe, expect, it } from 'vitest';
import { assertCsrf, isAllowedOrigin } from './csrf.js';

describe('csrf DEC-053', () => {
  it('R: чужой Origin на POST → отказ', () => {
    expect(isAllowedOrigin('https://evil.example', ['https://arhellist.ru'])).toBe(false);
    const result = assertCsrf(
      {
        method: 'POST',
        headers: { origin: 'https://evil.example', 'x-csrf-token': 'abc' },
        cookies: { nova_csrf: 'abc' },
      } as never,
      ['https://arhellist.ru'],
    );
    expect(result.ok).toBe(false);
  });

  it('R: совпадение CSRF cookie и заголовка → ok', () => {
    const result = assertCsrf(
      {
        method: 'POST',
        headers: { origin: 'https://arhellist.ru', 'x-csrf-token': 'token-1' },
        cookies: { nova_csrf: 'token-1' },
      } as never,
      ['https://arhellist.ru'],
    );
    expect(result.ok).toBe(true);
  });
});
