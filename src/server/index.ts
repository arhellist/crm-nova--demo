/**
 * Точка входа backend: health, Auth BFF, Data Gateway, отчёты (DEC-053).
 *
 * Порядок: конфигурация → приложение → cookie plugin → auth/data → reporting.
 * Запись CRM идёт только через Supabase PostgREST/RPC с user JWT из cookie (не service_role).
 */
import { setTimeout as delay } from 'node:timers/promises';
import cookie from '@fastify/cookie';
import { readReportingConfig } from '../reporting/config.js';
import { createQueryRows, createReplicaPool } from '../reporting/db.js';
import { mountReportingSurface } from '../reporting/server.js';
import { env } from '../shared/config/env.js';
import { createLogger } from '../shared/logger.js';
import { buildApp } from './app.js';
import { readCookiePolicy } from './auth/cookies.js';
import { createAdminClient } from './auth/admin.js';
import { createGoTrueClient } from './auth/gotrue.js';
import { registerAuthRoutes } from './auth/routes.js';
import { registerDataGateway } from './gateway/data.js';

const SHUTDOWN_TIMEOUT_MS = 4_500;

const logger = createLogger({
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV === 'development',
});

async function shutdown(
  app: Awaited<ReturnType<typeof buildApp>>,
  pool: { end: () => Promise<void> } | null,
  signal: string,
): Promise<void> {
  logger.info({ signal }, 'получен сигнал завершения');
  const timeout = delay(SHUTDOWN_TIMEOUT_MS, 'timeout' as const);
  const closed = await Promise.race([app.close().then(() => 'closed' as const), timeout]);
  if (closed === 'timeout') {
    logger.warn({ signal }, 'сервер не закрылся за отведённое время, завершение принудительное');
  }
  if (pool) await pool.end().catch(() => undefined);
  process.exit(0);
}

async function main(): Promise<void> {
  const app = await buildApp({ logger, fastifyOptions: { trustProxy: true } });

  await app.register(cookie);

  const cookiePolicy = readCookiePolicy(process.env);
  const gotrue = createGoTrueClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const admin = env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

  registerAuthRoutes(app, {
    gotrue,
    cookiePolicy,
    allowedOrigins: env.ALLOWED_ORIGINS,
    supabaseUrl: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    admin,
  });

  registerDataGateway(app, {
    supabaseUrl: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    allowedOrigins: env.ALLOWED_ORIGINS,
    cookiePolicy,
  });

  const reporting = readReportingConfig(process.env);
  const pool = createReplicaPool(reporting.DATABASE_URL_REPLICA);
  const query = createQueryRows(pool);
  const demoStand = process.env.DEMO_STAND === 'true' || process.env.DEMO_STAND === '1';
  await mountReportingSurface(app, {
    apiToken: reporting.API_TOKEN,
    allowedOrigins: reporting.ALLOWED_ORIGINS,
    query,
    cacheTtlMs: reporting.REPORT_CACHE_TTL_S * 1000,
    startedAtMs: Date.now(),
    getPoolStats: () => ({
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    }),
    ...(demoStand
      ? {
          getReplicationState: () =>
            Promise.resolve({
              status: 'streaming' as const,
              lag_seconds: 0,
              last_error: null,
            }),
        }
      : {}),
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
