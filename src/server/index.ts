/**
 * Точка входа read-only backend.
 *
 * Порядок намеренно жёсткий: сначала конфигурация (импорт `env` падает с кодом 1, если она
 * невалидна), затем логгер, затем сборка приложения. Штатное завершение по `SIGTERM`/`SIGINT`
 * закрывает HTTP-сервер и завершает процесс с кодом 0 не дольше 5 с (A01.5); ошибка старта —
 * лог `fatal` и код 1. Секреты в лог не попадают: их редактирует pino (см. `shared/logger.ts`).
 */
import { setTimeout as delay } from 'node:timers/promises';
import { env } from '../shared/config/env.js';
import { createLogger } from '../shared/logger.js';
import { buildApp } from './app.js';

/** Верхняя граница на штатное завершение: не дольше 5 секунд по контракту. */
const SHUTDOWN_TIMEOUT_MS = 4_500;

const logger = createLogger({
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV === 'development',
});

/** Закрывает сервер, но не ждёт вечно: зависший сокет не должен держать процесс. */
async function shutdown(app: Awaited<ReturnType<typeof buildApp>>, signal: string): Promise<void> {
  logger.info({ signal }, 'получен сигнал завершения');
  // `node:timers/promises` вместо глобального setTimeout: таймер не держит event loop
  // и не требует ручного clearTimeout.
  const timeout = delay(SHUTDOWN_TIMEOUT_MS, 'timeout' as const);
  const closed = await Promise.race([app.close().then(() => 'closed' as const), timeout]);
  if (closed === 'timeout') {
    logger.warn({ signal }, 'сервер не закрылся за отведённое время, завершение принудительное');
  }
  process.exit(0);
}

async function main(): Promise<void> {
  const app = await buildApp({ logger });

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      void shutdown(app, signal);
    });
  }

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info({ port: env.PORT, commit: env.GIT_COMMIT }, 'сервер запущен');
  } catch (error) {
    logger.fatal({ err: error }, 'не удалось запустить сервер');
    process.exit(1);
  }
}

void main();
