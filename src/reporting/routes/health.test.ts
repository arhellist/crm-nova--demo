/**
 * A11.3, A11.6 — здоровье репликации и деградация без падения процесса.
 *
 * `/health` живёт без БД и обязан отвечать 200, когда отчёты уже недоступны;
 * `/health/replication` показывает честный лаг из `pg_stat_subscription`, а не оптимистичный ноль.
 */
import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { QueryRows, ReplicationState } from '../db.js';
import { buildReportingServer } from '../server.js';
import { clearReportCache } from './reports.js';
import { resetHttpMetrics } from './health.js';

const TOKEN = 'reporting-token-0123456789abcdef';

/** Строка `pg_stat_subscription` с лагом 40 с: worker работает, но данные устарели. */
const LAGGING_SUBSCRIPTION = {
  pid: 4242,
  last_error: null,
  lag_seconds: 40,
};

interface Setup {
  app: FastifyInstance;
  query: QueryRows & ReturnType<typeof vi.fn>;
}

async function setup(getReplicationState: () => Promise<ReplicationState>): Promise<Setup> {
  const query = vi.fn(async () => [LAGGING_SUBSCRIPTION]) as unknown as QueryRows &
    ReturnType<typeof vi.fn>;
  const app = await buildReportingServer({
    apiToken: TOKEN,
    allowedOrigins: ['https://crm.example.test'],
    query,
    getReplicationState,
    cacheTtlMs: 30_000,
    now: () => new Date('2026-11-04T12:00:00.000Z'),
  });
  return { app, query };
}

describe('A11.3 лаг репликации', () => {
  let helper: Setup;

  beforeAll(async () => {
    helper = await setup(async () => ({
      status: 'lagging',
      lag_seconds: 40,
      last_error: null,
    }));
  });

  afterAll(async () => {
    await helper.app.close();
  });

  it('A11.3 при лаге 40 с /health/replication отдаёт lagging и честный лаг', async () => {
    const response = await helper.app.inject({
      method: 'GET',
      url: '/health/replication',
      remoteAddress: '10.3.0.1',
    });
    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.status).toBe('lagging');
    expect(body.lag_seconds).toBeGreaterThanOrEqual(40);
    expect(body.last_error).toBeNull();
    expect(response.headers['retry-after']).toBe('30');
  });
});

describe('метрики контура для D13', () => {
  it('метрики содержат запросы, гистограмму, пул и время синхронизации', async () => {
    resetHttpMetrics();
    const query = vi.fn(async () => [LAGGING_SUBSCRIPTION]) as unknown as QueryRows &
      ReturnType<typeof vi.fn>;
    const app = await buildReportingServer({
      apiToken: TOKEN,
      allowedOrigins: ['https://crm.example.test'],
      query,
      getReplicationState: async () => ({ status: 'streaming', lag_seconds: 2, last_error: null }),
      getPoolStats: () => ({ total: 10, idle: 8, waiting: 2 }),
      now: () => new Date('2026-11-04T12:00:00.000Z'),
    });
    try {
      await app.inject({ method: 'GET', url: '/health', remoteAddress: '10.3.1.1' });
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
        headers: { authorization: `Bearer ${TOKEN}` },
        remoteAddress: '10.3.1.2',
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('http_requests_total{route="/health",status="200"}');
      expect(response.body).toContain('http_request_duration_seconds_bucket');
      expect(response.body).toContain('http_request_duration_seconds_count');
      expect(response.body).toContain('replica_lag_seconds 40');
      expect(response.body).toContain('replica_last_sync_timestamp');
      expect(response.body).toContain('db_pool_total 10');
      expect(response.body).toContain('db_pool_acquired 2');
      expect(response.body).toContain('db_pool_waiting 2');
    } finally {
      await app.close();
    }
  });
});

describe('A11.6 деградация реплики', () => {
  let helper: Setup;

  beforeAll(async () => {
    helper = await setup(async () => ({
      status: 'broken',
      lag_seconds: 0,
      last_error: 'подписка nova_sub не запущена',
    }));
  });

  afterAll(async () => {
    await helper.app.close();
  });

  beforeEach(() => {
    clearReportCache();
    helper.query.mockClear();
  });

  it('A11.6 при остановленной реплике отчёт — 503, /health — 200', async () => {
    const report = await helper.app.inject({
      method: 'GET',
      url: '/api/reports/objects',
      headers: { authorization: `Bearer ${TOKEN}` },
      remoteAddress: '10.3.0.2',
    });
    expect(report.statusCode).toBe(503);
    // Код из openapi (E_REPLICA_DOWN) — контракт источника истины; текстовое имя
    // REPLICA_UNAVAILABLE из ACCEPTANCE описывает тот же отказ.
    expect(report.json()).toMatchObject({ error: { code: 'E_REPLICA_DOWN' } });
    expect(report.body).not.toMatch(/postgres(ql)?:\/\//i);

    const health = await helper.app.inject({
      method: 'GET',
      url: '/health',
      remoteAddress: '10.3.0.3',
    });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: 'ok' });
  });

  it('A11.6 недоступная БД в /health/replication не роняет процесс', async () => {
    helper.query.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:5433'));
    const response = await helper.app.inject({
      method: 'GET',
      url: '/health/replication',
      remoteAddress: '10.3.0.4',
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'broken' });
    expect(response.body).not.toContain('ECONNREFUSED');

    const health = await helper.app.inject({
      method: 'GET',
      url: '/health',
      remoteAddress: '10.3.0.5',
    });
    expect(health.statusCode).toBe(200);
  });
});
