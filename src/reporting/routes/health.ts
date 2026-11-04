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
  /** Счётчики пула из `pg`: метрики насыщения NFR12. */
  getPoolStats?: () => PoolStats;
}

/** Снимок пула: `pg` отдаёт числа без ожидания. */
export interface PoolStats {
  total: number;
  idle: number;
  waiting: number;
}

/** Гистограмма длительности: корзины в секундах (NFR4: p95 ≤ 300 мс). */
const DURATION_BUCKETS = [0.05, 0.1, 0.25, 0.3, 0.5, 1, 2, 5] as const;

interface RouteMetrics {
  statuses: Map<number, number>;
  buckets: number[];
  sum: number;
  count: number;
}

const routeMetrics = new Map<string, RouteMetrics>();

/** Путь без query: метка `route` не должна размножаться параметрами запроса. */
export function normalizeRoute(url: string): string {
  const path = url.split('?')[0] ?? url;
  return path.length > 0 ? path : '/';
}

/** Учёт запроса: вызывается из `onResponse`, ошибки здесь не влияют на ответ. */
export function observeHttpRequest(route: string, status: number, durationMs: number): void {
  const key = normalizeRoute(route);
  let metrics = routeMetrics.get(key);
  if (!metrics) {
    metrics = {
      statuses: new Map(),
      buckets: DURATION_BUCKETS.map(() => 0),
      sum: 0,
      count: 0,
    };
    routeMetrics.set(key, metrics);
  }
  metrics.statuses.set(status, (metrics.statuses.get(status) ?? 0) + 1);
  const seconds = Math.max(durationMs, 0) / 1000;
  metrics.sum += seconds;
  metrics.count += 1;
  for (const [index, bucket] of DURATION_BUCKETS.entries()) {
    if (seconds <= bucket) metrics.buckets[index] = (metrics.buckets[index] ?? 0) + 1;
  }
}

/** Сброс счётчиков: тесты не должны зависеть от порядка запросов. */
export function resetHttpMetrics(): void {
  routeMetrics.clear();
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

function httpMetricsLines(): string[] {
  const lines: string[] = [
    '# HELP http_requests_total Запросы отчётного API по маршруту и статусу',
    '# TYPE http_requests_total counter',
  ];
  for (const [route, metrics] of [...routeMetrics.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (const [status, count] of [...metrics.statuses.entries()].sort(([a], [b]) => a - b)) {
      lines.push(`http_requests_total{route="${route}",status="${status}"} ${count}`);
    }
  }
  lines.push(
    '# HELP http_request_duration_seconds Длительность запросов отчётного API',
    '# TYPE http_request_duration_seconds histogram',
  );
  for (const [route, metrics] of [...routeMetrics.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (const [index, bucket] of DURATION_BUCKETS.entries()) {
      lines.push(
        `http_request_duration_seconds_bucket{route="${route}",le="${bucket}"} ${metrics.buckets[index] ?? 0}`,
      );
    }
    lines.push(
      `http_request_duration_seconds_bucket{route="${route}",le="+Inf"} ${metrics.count}`,
      `http_request_duration_seconds_sum{route="${route}"} ${metrics.sum.toFixed(6)}`,
      `http_request_duration_seconds_count{route="${route}"} ${metrics.count}`,
    );
  }
  return lines;
}

function metricsText(
  state: ReplicationState,
  uptimeSeconds: number,
  pool: PoolStats,
  syncedAtSeconds: number,
): string {
  const streaming = state.status === 'streaming' ? 1 : 0;
  const lines = [
    ...httpMetricsLines(),
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
    '# HELP replica_last_sync_timestamp Время последней синхронизации подписки, unix-секунды',
    '# TYPE replica_last_sync_timestamp gauge',
    `replica_last_sync_timestamp ${syncedAtSeconds}`,
    '# HELP db_pool_total Соединений в пуле реплики',
    '# TYPE db_pool_total gauge',
    `db_pool_total ${pool.total}`,
    '# HELP db_pool_acquired Занятых соединений пула',
    '# TYPE db_pool_acquired gauge',
    `db_pool_acquired ${Math.max(pool.total - pool.idle, 0)}`,
    '# HELP db_pool_waiting Ожидающих соединения запросов',
    '# TYPE db_pool_waiting gauge',
    `db_pool_waiting ${pool.waiting}`,
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
    const current = now();
    const uptimeSeconds = Math.max((current.getTime() - startedAt) / 1000, 0);
    const pool = deps.getPoolStats?.() ?? { total: 0, idle: 0, waiting: 0 };
    // Время последней синхронизации выводится из лага: отрицательных значений не бывает.
    const syncedAtSeconds = Math.max(Math.floor(current.getTime() / 1000 - state.lag_seconds), 0);
    void reply.type('text/plain; version=0.0.4; charset=utf-8');
    return reply.send(metricsText(state, uptimeSeconds, pool, syncedAtSeconds));
  });
}
