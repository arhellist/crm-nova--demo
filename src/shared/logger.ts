/**
 * Логгер приложения на pino.
 *
 * Зачем отдельный модуль: в проекте один формат логов и один набор редактируемых полей.
 * Инварианты:
 *  - `authorization`, токены, `cookie`, `password` никогда не попадают в вывод (NFR16, INV-007);
 *  - каждая запись запроса несёт `request_id` — из заголовка `x-request-id` или сгенерированный
 *    (связывает лог запроса, ответа и ошибки);
 *  - в development — человекочитаемый `pino-pretty`, в production и test — JSON.
 *
 * Модуль не читает `process.env`: уровень и режим передаёт вызывающий код (`src/server/index.ts`).
 */
import { randomUUID } from 'node:crypto';
import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';

/** Поля, которые pino заменяет на `[Redacted]` до сериализации. */
export const REDACT_PATHS = [
  'authorization',
  'req.headers.authorization',
  'headers.authorization',
  'access_token',
  'refresh_token',
  'cookie',
  'req.headers.cookie',
  'password',
  '*.authorization',
  '*.access_token',
  '*.refresh_token',
  '*.password',
];

export interface CreateLoggerOptions {
  /** Уровень из `env.LOG_LEVEL`. */
  level: string;
  /** `true` — pino-pretty (development), `false` — JSON (production/test). */
  pretty: boolean;
  /** Куда писать; по умолчанию stdout. В тестах — поток в память. */
  destination?: DestinationStream;
}

/** Собирает pino с едиными redact-правилами. */
export function createLogger(options: CreateLoggerOptions): Logger {
  const base: LoggerOptions = {
    level: options.level,
    redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
    base: { service: 'nova-crm-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  const config: LoggerOptions = options.pretty
    ? {
        ...base,
        transport: {
          target: 'pino-pretty',
          options: { colorize: false, translateTime: 'SYS:standard', singleLine: true },
        },
      }
    : base;

  return options.destination ? pino(config, options.destination) : pino(config);
}

/**
 * Идентификатор запроса: заголовок `x-request-id` (например, от Cloudflare) или новый UUID.
 * Заголовок принимаем только безопасной длины и без управляющих символов, иначе генерируем свой —
 * иначе клиент может подделать корреляцию логов.
 */
export function resolveRequestId(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  if (value && /^[A-Za-z0-9._:-]{1,128}$/.test(value)) return value;
  return randomUUID();
}

/** Контекст записи журнала для конкретного запроса. */
export function requestContext(requestId: string): { request_id: string } {
  return { request_id: requestId };
}
