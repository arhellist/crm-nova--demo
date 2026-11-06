/**
 * A01.2, A01.4, A01.6 — HTTP-каркас: `/health`, rate limit и корреляция логов по request_id.
 *
 * Окружение выставляется до импорта модулей (`vi.hoisted`): `env.ts` валидирует его на импорте.
 * Каждый тест получает свой IP (`remoteAddress`), чтобы счётчик rate limit не перетекал
 * между сценариями.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key-not-a-secret-for-unit';
  process.env.API_TOKEN = 'test-token-value-1234567890';
  process.env.DATABASE_URL = 'postgresql://nova_ro:secret@127.0.0.1:5433/nova_replica';
  process.env.ALLOWED_ORIGINS = 'http://127.0.0.1:5173';
  process.env.GIT_COMMIT = 'testsha';
  process.env.LOG_LEVEL = 'info';
});

const { buildApp } = await import('./app.js');
const { createLogger } = await import('../shared/logger.js');

/** Пакетная версия — источник истины для `/health` (A01.2). */
const packageVersion = (JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string })
  .version;

const logLines: string[] = [];

function memoryLogger() {
  return createLogger({
    level: 'info',
    pretty: false,
    destination: {
      write(chunk: string): void {
        logLines.push(chunk);
      },
    },
  });
}

describe('A01.2 / A01.4 / A01.6 HTTP-каркас', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    logLines.length = 0;
    app = await buildApp({
      logger: memoryLogger(),
      startedAt: Date.now(),
      rateLimitMax: 60,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('A01.2 GET /health отвечает по схеме и версией из package.json', async () => {
    const response = await app.inject({ method: 'GET', url: '/health', remoteAddress: '10.1.0.1' });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; version: string; commit: string; uptime_s: number }>();
    expect(body.status).toBe('ok');
    expect(body.version).toBe(packageVersion);
    expect(body.commit).toBe('testsha');
    expect(body.uptime_s).toBeGreaterThanOrEqual(0);
    expect(response.body).not.toContain('postgresql://');

    // DEC-072: alias под nginx prefix `/crm-nova/api/`.
    const alias = await app.inject({ method: 'GET', url: '/api/health', remoteAddress: '10.1.0.2' });
    expect(alias.statusCode).toBe(200);
    expect(alias.json()).toEqual(body);
  });

  it('A01.4 61-й запрос за минуту с одного IP получает 429 и retry-after', async () => {
    const remoteAddress = '10.2.0.1';
    for (let i = 0; i < 60; i += 1) {
      const ok = await app.inject({ method: 'GET', url: '/health', remoteAddress });
      expect(ok.statusCode).toBe(200);
    }

    const limited = await app.inject({ method: 'GET', url: '/health', remoteAddress });

    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(limited.json<{ error: { code: string } }>().error.code).toBe('E_RATE_LIMIT');
  });

  it('A01.6 x-request-id попадает в обе записи журнала запроса', async () => {
    logLines.length = 0;

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      remoteAddress: '10.3.0.1',
      headers: { 'x-request-id': 'abc' },
    });
    expect(response.statusCode).toBe(200);

    const records = logLines
      .join('\n')
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as Record<string, unknown>];
        } catch {
          return [];
        }
      })
      .filter((record) => record['request_id'] === 'abc');

    expect(records.length).toBeGreaterThanOrEqual(2);
  });

  it('A01.6 заголовок authorization не попадает в журнал', async () => {
    logLines.length = 0;

    await app.inject({
      method: 'GET',
      url: '/health',
      remoteAddress: '10.4.0.1',
      headers: { authorization: 'Bearer secret-token-value', 'x-request-id': 'def' },
    });

    const output = logLines.join('\n');
    expect(output).not.toContain('secret-token-value');
  });

  it('A01.2 ошибки наружу — только код и сообщение без SQL', async () => {
    const response = await app.inject({ method: 'GET', url: '/unknown', remoteAddress: '10.5.0.1' });

    expect(response.statusCode).toBe(404);
    const body = response.json<{ error: { code: string; message: string } }>();
    expect(body.error.code).toBe('P0400');
    expect(body.error.message).not.toMatch(/select|from|table|sql/i);
    expect(response.body).not.toContain('stack');
  });
});
