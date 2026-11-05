// @vitest-environment node
/**
 * A11.6 — отчётный контур в едином backend-процессе.
 *
 * Зачем этот тест: до DEC-033 отчёты, `/health/replication` и `/metrics` существовали
 * только внутри отдельного `buildReportingServer`, а запускаемый процесс (`src/server/index.ts`)
 * их не монтировал — образ отвечал 404 на весь продукт. Здесь проверяется именно сборка
 * «базовый `/health` + отчётный контур на одном Fastify»: дублирования маршрута нет,
 * `/health` остаётся контрактом D01, а отчёты требуют токен и остаются только чтением.
 */
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { mountReportingSurface } from './server.js';

const TOKEN = 'stage-token-0123456789abcdefghijkl';
const ORIGIN = 'http://127.0.0.1:4173';

const STREAMING = { status: 'streaming' as const, lag_seconds: 1, last_error: null };

/** Заглушка БД: состояние подписки — строкой каталога, отчётные вьюхи — пустым набором. */
const queryRows = async (sql: string): Promise<unknown[]> =>
  sql.includes('pg_stat_subscription')
    ? [{ pid: 42, last_error: null, lag_seconds: '1' }]
    : [];

/** Приложение с уже зарегистрированным `/health` — как после `buildApp` из D01. */
function buildAppWithBaseHealth() {
  const app = Fastify({ logger: false });
  app.get('/health', async () => ({ status: 'ok', version: '0.0.0', commit: 'test', uptime_s: 1 }));
  return app;
}

const apps: ReturnType<typeof buildAppWithBaseHealth>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('A11.6 единый процесс backend + отчётный контур', () => {
  it('A11.6 монтирует отчёты поверх базового /health без дублирования маршрута', async () => {
    const app = buildAppWithBaseHealth();
    apps.push(app);
    await mountReportingSurface(app, {
      apiToken: TOKEN,
      allowedOrigins: [ORIGIN],
      query: queryRows,
      getReplicationState: async () => STREAMING,
    });

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    // Контракт D01 сохраняется: version/commit/uptime_s, а не сокращённый ответ D11.
    expect(health.json()).toMatchObject({ status: 'ok', version: '0.0.0', commit: 'test' });

    const replication = await app.inject({ method: 'GET', url: '/health/replication' });
    expect(replication.statusCode).toBe(200);
    expect(replication.json()).toEqual(STREAMING);

    const unauthorized = await app.inject({ method: 'GET', url: '/api/reports/objects' });
    expect(unauthorized.statusCode).toBe(401);

    const write = await app.inject({ method: 'POST', url: '/api/reports/objects' });
    expect(write.statusCode).toBe(405);

    const objects = await app.inject({
      method: 'GET',
      url: '/api/reports/objects',
      headers: { authorization: `Bearer ${TOKEN}`, origin: ORIGIN },
    });
    expect(objects.statusCode).toBe(200);
    expect(objects.json()).toMatchObject({ source: 'replica', data: [] });
  });

  it('A11.6 отдаёт 503 и retry-after, когда реплика недоступна', async () => {
    const app = buildAppWithBaseHealth();
    apps.push(app);
    await mountReportingSurface(app, {
      apiToken: TOKEN,
      allowedOrigins: [ORIGIN],
      query: queryRows,
      getReplicationState: async () => ({
        status: 'broken',
        lag_seconds: 0,
        last_error: 'реплика недоступна',
      }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/reports/workload',
      headers: { authorization: `Bearer ${TOKEN}`, origin: ORIGIN },
    });
    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBe('30');
    expect(response.json()).toMatchObject({ error: { code: 'E_REPLICA_DOWN' } });
  });
});
