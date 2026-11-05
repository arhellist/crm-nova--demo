/**
 * Точка входа read-only backend.
 *
 * Порядок намеренно жёсткий: сначала конфигурация (импорт `env` падает с кодом 1, если она
 * невалидна), затем логгер, затем сборка приложения. Штатное завершение по `SIGTERM`/`SIGINT`
 * закрывает HTTP-сервер и завершает процесс с кодом 0 не дольше 5 с (A01.5); ошибка старта —
 * лог `fatal` и код 1. Секреты в лог не попадают: их редактирует pino (см. `shared/logger.ts`).
 *
 * Один процесс обслуживает весь backend: базовый контракт `/health` (D01) и отчётный контур
 * D11 (отчёты, `/health/replication`, `/metrics`). До DEC-033 отчётные маршруты жили в
 * отдельном файле и не попадали в запускаемый процесс — образ отвечал 404 на весь продукт.
 */
import { setTimeout as delay } from 'node:timers/promises';
import { readReportingConfig } from '../reporting/config.js';
import { createQueryRows, createReplicaPool } from '../reporting/db.js';
import { mountReportingSurface } from '../reporting/server.js';
import { env } from '../shared/config/env.js';
import { createLogger } from '../shared/logger.js';
import { buildApp } from './app.js';

/** Верхняя граница на штатное завершение: не дольше 5 секунд по контракту. */
const SHUTDOWN_TIMEOUT_MS = 4_500;

const logger = createLogger({
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV === 'development',
});

/** Закрывает сервер и пул реплики, но не ждёт вечно: зависший сокет не должен держать процесс. */
async function shutdown(
  app: Awaited<ReturnType<typeof buildApp>>,
  pool: { end: () => Promise<void> } | null,
  signal: string,
): Promise<void> {
  logger.info({ signal }, 'получен сигнал завершения');
  // `node:timers/promises` вместо глобального setTimeout: таймер не держит event loop
  // и не требует ручного clearTimeout.
  const timeout = delay(SHUTDOWN_TIMEOUT_MS, 'timeout' as const);
  const closed = await Promise.race([app.close().then(() => 'closed' as const), timeout]);
  if (closed === 'timeout') {
    logger.warn({ signal }, 'сервер не закрылся за отведённое время, завершение принудительное');
  }
  if (pool) await pool.end().catch(() => undefined);
  process.exit(0);
}

async function main(): Promise<void> {
  const app = await buildApp({ logger });

  // Отчётный контур читает только контур чтения: `DATABASE_URL_REPLICA`, без primary (INV-001).
  // Ошибка конфигурации — отказ старта: backend без отчётов не является поставкой.
  const reporting = readReportingConfig(process.env);
  const pool = createReplicaPool(reporting.DATABASE_URL_REPLICA);
  await mountReportingSurface(app, {
    apiToken: reporting.API_TOKEN,
    allowedOrigins: reporting.ALLOWED_ORIGINS,
    query: createQueryRows(pool),
    cacheTtlMs: reporting.REPORT_CACHE_TTL_S * 1000,
    startedAtMs: Date.now(),
    getPoolStats: () => ({
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    }),
  });

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      void shutdown(app, pool, signal);
    });
  }

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info({ port: env.PORT, commit: env.GIT_COMMIT }, 'сервер запущен');
  } catch (error) {
    logger.fatal({ err: error }, 'не удалось запустить сервер');
    await pool.end().catch(() => undefined);
    process.exit(1);
  }
}

void main();
