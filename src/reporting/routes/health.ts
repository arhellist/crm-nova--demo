/**
 * Здоровье отчётного контура и метрики Prometheus.
 *
 * Инварианты:
 *  - `/health` не зависит от реплики и отвечает 200, даже когда отчёты недоступны (A11.6);
 *  - `/health/replication` отдаёт `ReplicationStatus` openapi: 200 только при `streaming`,
 *    при `lagging`/`broken` — 503 с тем же телом (A11.3);
 *  - `/metrics` — текст Prometheus с именами из `tooling/observability.md`; значения токенов,
 *    строк подключения и SQL в метрики не попадают (NFR16);
 *  - недоступность БД не роняет процесс: состояние подписки показывается как `broken`.
 */
import type { FastifyInstance } from 'fastify';
import type { QueryRows, ReplicationState } from '../db.js';
import { readReplicationState } from '../db.js';
import { reportCacheStats } from './reports.js';

export interface HealthDeps {
  query: QueryRows;
  now?: () => Date;
  startedAtMs?: number;
}

/** Состояние при недоступной реплике: те же поля, что у openapi ReplicationStatus. */
const BROKEN_STATE: ReplicationState = {
  status: 'broken',
  lag_seconds: 0,
  last_error: 'реплика недоступна',
};

async function safeReplicationState(deps: HealthDeps): Promise<ReplicationState> {
  try {
    return await readReplicationState(deps.query);
  } catch {
    return BROKEN_STATE;
  }
}

function metricsText(state: ReplicationState, uptimeSeconds: number): string {
  const streaming = state.status === 'streaming' ? 1 : 0;
  const lines = [
    '# HELP replica_lag_seconds Лаг подписки nova_sub в секундах',
    '# TYPE replica_lag_seconds gauge',
    `replica_lag_seconds ${state.lag_seconds}`,
    '# HELP replica_streaming Подписка streaming (1) или нет (0)',
    '# TYPE replica_streaming gauge',
    `replica_streaming ${streaming}`,
    '# HELP report_cache_hit_total Попадания в кэш отчётов',
    '# TYPE report_cache_hit_total counter',
    `report_cache_hit_total ${reportCacheStats.hit}`,
    '# HELP report_cache_miss_total Промахи кэша отчётов',
    '# TYPE report_cache_miss_total counter',
    `report_cache_miss_total ${reportCacheStats.miss}`,
    '# HELP reporting_uptime_seconds Время работы процесса отчётного API',
    '# TYPE reporting_uptime_seconds gauge',
    `reporting_uptime_seconds ${uptimeSeconds.toFixed(3)}`,
  ];
  return `${lines.join('\n')}\n`;
}

export function registerHealthRoutes(app: FastifyInstance, deps: HealthDeps): void {
  const now = deps.now ?? (() => new Date());
  const startedAt = deps.startedAtMs ?? Date.now();

  app.get('/health', async (_request, reply) => {
    const uptimeSeconds = Math.max((now().getTime() - startedAt) / 1000, 0);
    return reply.send({ status: 'ok', uptime_s: Number(uptimeSeconds.toFixed(3)) });
  });

  app.get('/health/replication', async (_request, reply) => {
    const state = await safeReplicationState(deps);
    const statusCode = state.status === 'streaming' ? 200 : 503;
    if (statusCode === 503) {
      void reply.header('retry-after', '30');
    }
    return reply.code(statusCode).send(state);
  });

  app.get('/metrics', async (_request, reply) => {
    // Метрики не должны падать из-за БД: при недоступной реплике отдаём streaming=0.
    let state: ReplicationState;
    try {
      state = await readReplicationState(deps.query);
    } catch {
      state = BROKEN_STATE;
    }
    const uptimeSeconds = Math.max((now().getTime() - startedAt) / 1000, 0);
    void reply.type('text/plain; version=0.0.4; charset=utf-8');
    return reply.send(metricsText(state, uptimeSeconds));
  });
}
