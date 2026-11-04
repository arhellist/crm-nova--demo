/**
 * A01.3 — логгер редактирует секреты.
 *
 * Тест пишет в поток в памяти и проверяет, что ни один токен, cookie или пароль не попал
 * в сериализованный вывод; заголовок authorization остаётся помеченным как `[Redacted]`.
 */
import { describe, expect, it } from 'vitest';
import { createLogger, REDACT_PATHS, requestContext, resolveRequestId } from './logger.js';

const SECRET = 'super-secret-token-value';

function capture(): { lines: string[]; stream: { write(chunk: string): void } } {
  const lines: string[] = [];
  return {
    lines,
    stream: {
      write(chunk: string): void {
        lines.push(chunk);
      },
    },
  };
}

describe('A01.3 логгер', () => {
  it('A01.3 не выводит authorization, access_token, cookie и password', () => {
    const captured = capture();
    const logger = createLogger({ level: 'info', pretty: false, destination: captured.stream });

    logger.info(
      {
        authorization: `Bearer ${SECRET}`,
        access_token: SECRET,
        refresh_token: SECRET,
        cookie: `session=${SECRET}`,
        password: SECRET,
        request_id: 'abc',
      },
      'запрос',
    );

    const output = captured.lines.join('\n');
    expect(output).not.toContain(SECRET);
    expect(output).toContain('[Redacted]');
    expect(output).toContain('"request_id":"abc"');
  });

  it('A01.3 редактирует вложенный заголовок запроса', () => {
    const captured = capture();
    const logger = createLogger({ level: 'info', pretty: false, destination: captured.stream });

    logger.info({ req: { headers: { authorization: `Bearer ${SECRET}`, cookie: SECRET } } }, 'вход');

    expect(captured.lines.join('\n')).not.toContain(SECRET);
    expect(REDACT_PATHS).toContain('req.headers.authorization');
  });

  it('A01.3 request_id берётся из заголовка и валидируется', () => {
    expect(resolveRequestId('abc')).toBe('abc');
    expect(resolveRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
    // Управляющие символы и пробелы в заголовке не принимаем: подделка корреляции логов.
    expect(resolveRequestId('bad id\u0000')).not.toBe('bad id\u0000');
    expect(requestContext('abc')).toEqual({ request_id: 'abc' });
  });
});
