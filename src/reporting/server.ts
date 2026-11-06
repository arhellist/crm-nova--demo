/**
 * Отчётный backend: read-only сервис для отчётов и здоровья репликации (D11).
 *
 * Инварианты:
 *  - процесс знает только строку подключения к реплике: primary в конфигурации отсутствует,
 *    поэтому путь записи невозможен (INV-001, A11.7);
 *  - `/api/*` и `/metrics` защищены `API_TOKEN` (Bearer) до обращения к БД; сравнение
 *    constant-time, токен не логируется (NFR16, A11.2);
 *  - `Origin` разрешён только из allowlist, без `*` и без credentials; чужой Origin — 403;
 *  - мутирующие методы на всех маршрутах → 405 `E_METHOD_NOT_ALLOWED` (A11.2);
 *  - ошибки наружу — `{ error: { code, message, request_id } }` без стека, SQL и строки
 *    подключения (INV-007); недоступная реплика — 503, `/health` остаётся 200 (A11.6);
 *  - rate limit 60 запросов/мин на токен или адрес (NFR13).
 */
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { ReportingError, readReportingConfig } from './config.js';
import {
  createQueryRows,
  createReplicaPool,
  readReplicationState,
  type QueryRows,
  type ReplicationState,
} from './db.js';
import {
  observeHttpRequest,
  registerHealthRoutes,
  registerReplicationAndMetricsRoutes,
  type PoolStats,
} from './routes/health.js';
import { registerReportRoutes } from './routes/reports.js';

/** Только отчётный контур: auth/data BFF (DEC-053) не подпадает под API_TOKEN и запрет POST. */
function isReportingPath(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return (
    path.startsWith('/api/reports') ||
    path === '/health/replication' ||
    path === '/api/health/replication' ||
    path === '/metrics' ||
    path === '/api/metrics'
  );
}

/** Пути, закрытые токеном отчётов. `/health` и `/api/auth|data` — вне этого контура. */
function requiresToken(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return path.startsWith('/api/reports') || path === '/metrics' || path === '/api/metrics';
}

/** Сравнение Bearer-токена без утечки длины и префикса. */
export function tokenMatches(header: string | undefined, expected: string): boolean {
  const prefix = 'Bearer ';
  if (typeof header !== 'string' || !header.startsWith(prefix)) {
    return false;
  }
  const provided = Buffer.from(header.slice(prefix.length), 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return provided.length === wanted.length && timingSafeEqual(provided, wanted);
}

/** CORS: заголовки только для origin из allowlist; `*` не используется. */
function applyCors(reply: FastifyReply, origin: string | undefined, allowedOrigins: readonly string[]): void {
  if (origin === undefined || !allowedOrigins.includes(origin)) {
    return;
  }
  void reply.header('access-control-allow-origin', origin);
  void reply.header('vary', 'Origin');
  void reply.header('access-control-allow-methods', 'GET, OPTIONS');
  void reply.header('access-control-allow-headers', 'Authorization, Content-Type');
}

function isAllowedOrigin(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  return origin === undefined || allowedOrigins.includes(origin);
}

/** Ошибка БД: наружу только нейтральный 503, без текста драйвера и SQL. */
function isDatabaseError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (('code' in error && typeof (error as { code?: unknown }).code === 'string') ||
      'severity' in error)
  );
}

export interface ReportingServerOptions {
  apiToken: string;
  allowedOrigins: readonly string[];
  query: QueryRows;
  getReplicationState?: () => Promise<ReplicationState>;
  cacheTtlMs?: number;
  now?: () => Date;
  startedAtMs?: number;
  logger?: boolean;
  /** Снимок пула для `/metrics`; в тестах можно не передавать (нули). */
  getPoolStats?: () => PoolStats;
}

/** Собирает Fastify-приложение отдельно от запуска: тесты используют inject без сети. */
export async function buildReportingServer(options: ReportingServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false, disableRequestLogging: true });

  await app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      const auth = request.headers.authorization;
      return typeof auth === 'string' && auth.length > 0 ? auth : request.ip;
    },
    errorResponseBuilder: () => ({
      error: {
        code: 'E_RATE_LIMITED',
        message: 'Слишком много запросов, повторите позже',
      },
    }),
  });

  mountReportingGuards(app, options);

  registerHealthRoutes(app, {
    query: options.query,
    ...(options.now ? { now: options.now } : {}),
    ...(options.startedAtMs ? { startedAtMs: options.startedAtMs } : {}),
    ...(options.getPoolStats ? { getPoolStats: options.getPoolStats } : {}),
  });
  mountReportingRoutes(app, options);

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      error: { code: 'E_NOT_FOUND', message: 'Маршрут не найден', request_id: String(_request.id) },
    }),
  );

  mountReportingErrorHandler(app);

  return app;
}

/**
 * Единый production-процесс: базовый backend (D01) получает отчётный контур (D11).
 *
 * Зачем: до DEC-033 `npm start` поднимал только `src/server/index.ts`, где не было ни
 * отчётов, ни `/health/replication`, ни `/metrics` — образ отдавал 404 на весь продукт.
 * Здесь отчётный контур монтируется в тот же экземпляр Fastify: `/health` остаётся
 * контрактом D01, наружу добавляются отчёты, репликация и метрики.
 */
export async function mountReportingSurface(
  app: FastifyInstance,
  options: ReportingServerOptions,
): Promise<void> {
  await app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      const auth = request.headers.authorization;
      return typeof auth === 'string' && auth.length > 0 ? auth : request.ip;
    },
    errorResponseBuilder: () => ({
      error: {
        code: 'E_RATE_LIMITED',
        message: 'Слишком много запросов, повторите позже',
      },
    }),
  });
  mountReportingGuards(app, options);
  const getReplicationState =
    options.getReplicationState ?? (() => readReplicationState(options.query));
  registerReplicationAndMetricsRoutes(app, {
    query: options.query,
    getReplicationState,
    ...(options.now ? { now: options.now } : {}),
    ...(options.startedAtMs ? { startedAtMs: options.startedAtMs } : {}),
    ...(options.getPoolStats ? { getPoolStats: options.getPoolStats } : {}),
  });
  mountReportingRoutes(app, options);
  mountReportingErrorHandler(app);
}

/** Хуки доступа только для отчётных путей; `/api/auth` и `/api/data` обслуживает BFF (DEC-053). */
function mountReportingGuards(app: FastifyInstance, options: ReportingServerOptions): void {
  app.addHook('onRequest', async (request, reply) => {
    if (!isReportingPath(request.url)) {
      return;
    }
    const method = request.method.toUpperCase();
    if (method === 'OPTIONS') {
      // Preflight разрешён только известному Origin; тело не требуется.
      if (!isAllowedOrigin(request.headers.origin, options.allowedOrigins)) {
        return reply.code(403).send({
          error: {
            code: 'E_FORBIDDEN_ORIGIN',
            message: 'Origin не разрешён',
            request_id: String(request.id),
          },
        });
      }
      applyCors(reply, request.headers.origin, options.allowedOrigins);
      return reply.code(204).send();
    }
    if (method !== 'GET' && method !== 'HEAD') {
      return reply.code(405).send({
        error: {
          code: 'E_METHOD_NOT_ALLOWED',
          message: 'Отчётный API только читает',
          request_id: String(request.id),
        },
      });
    }
    if (!isAllowedOrigin(request.headers.origin, options.allowedOrigins)) {
      return reply.code(403).send({
        error: {
          code: 'E_FORBIDDEN_ORIGIN',
          message: 'Origin не разрешён',
          request_id: String(request.id),
        },
      });
    }
    if (requiresToken(request.url) && !tokenMatches(request.headers.authorization, options.apiToken)) {
      return reply.code(401).send({
        error: {
          code: 'E_UNAUTHORIZED',
          message: 'Требуется токен отчётного API',
          request_id: String(request.id),
        },
      });
    }
    applyCors(reply, request.headers.origin, options.allowedOrigins);
  });

  // Длительность и статус считаются по факту ответа: `onResponse` не влияет на обработку.
  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? request.url;
    observeHttpRequest(route, reply.statusCode, reply.elapsedTime);
  });
}

/** Отчёты и состояние репликации: только чтение, кэш и деградация без падения процесса. */
function mountReportingRoutes(app: FastifyInstance, options: ReportingServerOptions): void {
  registerReportRoutes(app, {
    query: options.query,
    getReplicationState:
      options.getReplicationState ?? (() => readReplicationState(options.query)),
    cacheTtlMs: options.cacheTtlMs ?? 30_000,
    ...(options.now ? { now: options.now } : {}),
  });
}

/** Ошибки отчётного контура: 503 на недоступную реплику, никаких SQL и стека наружу. */
function mountReportingErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ReportingError) {
      if (error.retryAfterSeconds !== null) {
        void reply.header('retry-after', String(error.retryAfterSeconds));
      }
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          request_id: String(request.id),
        },
      });
    }
    if (isDatabaseError(error) || (error as { code?: string }).code === 'ECONNREFUSED') {
      void reply.header('retry-after', '30');
      return reply.code(503).send({
        error: {
          code: 'E_REPLICA_DOWN',
          message: 'Реплика недоступна, отчёты временно не формируются',
          request_id: String(request.id),
        },
      });
    }
    request.log.error({ err: error }, 'необработанная ошибка отчётного API');
    return reply.code(500).send({
      error: {
        code: 'E_INTERNAL',
        message: 'Внутренняя ошибка отчётного API',
        request_id: String(request.id),
      },
    });
  });
}

/** Запуск процесса: конфигурация читается до создания пула, при ошибке — код 1. */
async function start(): Promise<void> {
  const config = readReportingConfig(process.env);
  const pool = createReplicaPool(config.DATABASE_URL_REPLICA);
  const app = await buildReportingServer({
    apiToken: config.API_TOKEN,
    allowedOrigins: config.ALLOWED_ORIGINS,
    query: createQueryRows(pool),
    cacheTtlMs: config.REPORT_CACHE_TTL_S * 1000,
    logger: true,
    getPoolStats: () => ({
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    }),
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'отчётный API завершает работу');
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: '0.0.0.0', port: config.PORT });
}

const invokedDirectly =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'не удалось запустить отчётный API';
    console.error(message);
    process.exit(1);
  });
}
