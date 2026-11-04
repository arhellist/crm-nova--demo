/**
 * Сборка Fastify-приложения read-only backend.
 *
 * Что держит модуль:
 *  - единый идентификатор запроса (`request_id`) во всех записях журнала (NFR16);
 *  - rate limit 60 запросов/мин на клиента с `429` и `retry-after` (D01, A01.4);
 *  - `GET /health` без авторизации и без обращения к БД — живость процесса, не зависимость (NFR5);
 *  - ошибки наружу только как `{ error: { code, message } }`, без стека и SQL (INV-007);
 *  - путь записи в backend отсутствует: маршруты только читающие (INV-001).
 *
 * Приложение собирается функцией `buildApp`, а не на импорте: тесты поднимают экземпляр
 * с логгером в память и своим набором зависимостей.
 */
import { createRequire } from 'node:module';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../shared/config/env.js';
import { requestContext, resolveRequestId } from '../shared/logger.js';

const require = createRequire(import.meta.url);

/** `package.json` — граница процесса: версия нужна в `/health`, схема проверяется Zod. */
const packageSchema = z.object({ version: z.string().min(1) });

/** Версия приложения; в тестах подменяется явно, чтобы не зависеть от файла. */
export function readPackageVersion(): string {
  return packageSchema.parse(require('../../package.json')).version;
}

/** Схема ответа `getHealth` из `OUTPUT/specs/openapi.yaml` (расширена полями version/commit). */
const healthResponseSchema = {
  type: 'object',
  required: ['status', 'version', 'commit', 'uptime_s'],
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['ok'] },
    version: { type: 'string' },
    commit: { type: 'string' },
    uptime_s: { type: 'number', minimum: 0 },
  },
} as const;

/**
 * Контекст rate limit, который плагин передаёт в `errorResponseBuilder`.
 * В типах плагина `statusCode` не объявлен, но в рантайме присутствует (default-обработчик
 * плагина читает именно его) — поэтому поле опционально и берётся с дефолтом 429.
 */
interface RateLimitContext {
  ban: boolean;
  after: string;
  max: number;
  ttl: number;
  statusCode?: number;
}

export interface HealthPayload {
  status: 'ok';
  version: string;
  commit: string;
  uptime_s: number;
}

export interface BuildAppOptions {
  /** Готовый pino-логгер (в тестах — с потоком в память). */
  logger?: FastifyBaseLogger;
  /** Версия приложения; по умолчанию — из `package.json`. */
  version?: string;
  /** Момент старта в мс; по умолчанию — момент сборки приложения. */
  startedAt?: number;
  /** Предел запросов в минуту; в тестах можно снизить, не меняя боевое значение. */
  rateLimitMax?: number;
  /** Настройки Fastify поверх дефолтов (нужны тестам жизненного цикла). */
  fastifyOptions?: { trustProxy?: boolean; disableRequestLogging?: boolean };
}

/** Код ошибки по HTTP-статусу: наружу уходят только стабильные коды домена (INV-007). */
function errorCodeForStatus(statusCode: number): string {
  if (statusCode === 403) return 'P0403';
  if (statusCode === 422) return 'P0422';
  if (statusCode === 429) return 'E_RATE_LIMIT';
  if (statusCode >= 500) return 'E_INTERNAL';
  return 'P0400';
}

/** Текст для пользователя: без деталей запроса, SQL и имён таблиц. */
function errorMessageForStatus(statusCode: number): string {
  if (statusCode === 403) return 'Нет доступа';
  if (statusCode === 404) return 'Не найдено';
  if (statusCode === 405) return 'Метод не поддерживается';
  if (statusCode === 422) return 'Недопустимое действие для текущего статуса';
  if (statusCode === 429) return 'Слишком много запросов, попробуйте позже';
  if (statusCode >= 500) return 'Не удалось получить данные, попробуйте позже';
  return 'Проверьте заполнение полей';
}

/**
 * Собирает приложение. Плагины регистрируются до маршрутов: rate limit должен
 * видеть `GET /health`, иначе A01.4 не выполняется.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const startedAt = options.startedAt ?? Date.now();
  const version = options.version ?? readPackageVersion();

  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: options.fastifyOptions?.trustProxy ?? true,
    disableRequestLogging: options.fastifyOptions?.disableRequestLogging ?? true,
    // request_id приходит от периметра (Cloudflare/прокси) или генерируется нами.
    genReqId: (request) => resolveRequestId(request.headers['x-request-id']),
  });

  await app.register(rateLimit, {
    global: true,
    max: options.rateLimitMax ?? 60,
    timeWindow: '1 minute',
    // Плагин выбрасывает то, что вернул builder: нужен Error со statusCode, иначе
    // общий обработчик отдаст 500 вместо 429 (и A01.4 не выполнится).
    errorResponseBuilder: (_request: FastifyRequest, context: RateLimitContext) => {
      const error = new Error('Слишком много запросов, попробуйте позже') as Error & {
        statusCode: number;
        code: string;
      };
      error.statusCode = context.statusCode ?? 429;
      error.code = 'E_RATE_LIMIT';
      return error;
    },
  });

  // Две записи на запрос (начало и конец) с одним request_id — этого требует A01.6.
  app.addHook('onRequest', (request, _reply, done) => {
    request.log.info(
      { ...requestContext(request.id), method: request.method, url: request.url },
      'запрос получен',
    );
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    request.log.info(
      {
        ...requestContext(request.id),
        status_code: reply.statusCode,
        duration_ms: Math.round(reply.elapsedTime),
      },
      'ответ отправлен',
    );
    done();
  });

  app.get(
    '/health',
    { schema: { response: { 200: healthResponseSchema } } },
    (): HealthPayload => ({
      status: 'ok',
      version,
      commit: env.GIT_COMMIT,
      uptime_s: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
    }),
  );

  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    // Полная ошибка — только в лог; клиенту — стабильный код и безопасный текст.
    request.log.error({ ...requestContext(request.id), err: error }, 'ошибка обработки запроса');
    void reply
      .status(statusCode)
      .send({ error: { code: errorCodeForStatus(statusCode), message: errorMessageForStatus(statusCode) } });
  });

  app.setNotFoundHandler((request, reply) => {
    request.log.warn({ ...requestContext(request.id), url: request.url }, 'маршрут не найден');
    void reply.status(404).send({ error: { code: 'P0400', message: 'Не найдено' } });
  });

  return app;
}
