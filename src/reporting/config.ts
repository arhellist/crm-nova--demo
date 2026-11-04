/**
 * Конфигурация отчётного backend (D11).
 *
 * Инварианты:
 *  - читаются только переменные контура чтения: `API_TOKEN`, `DATABASE_URL_REPLICA`,
 *    `REPORT_CACHE_TTL_S`, `PORT`, `ALLOWED_ORIGINS`;
 *  - строки подключения к primary в схеме нет: попытка прочитать `DATABASE_URL_PRIMARY*`
 *    не поддерживается и падает как неизвестная конфигурация (A11.7, INV-001);
 *  - ошибка валидации перечисляет только имена ключей, значения не печатаются (INV-007);
 *  - токен короче 32 символов не принимается, чтобы dev-заглушка не попала в прод.
 */
import { z } from 'zod';

/** Порог лага: NFR7 — p95 ≤ 5 с, алерт при > 30 с. Отчёт считается устаревшим после порога. */
export const REPLICA_LAG_ALERT_SECONDS = 30;

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  API_TOKEN: z.string().min(32),
  DATABASE_URL_REPLICA: z.string().min(1),
  REPORT_CACHE_TTL_S: z.coerce.number().int().min(1).max(300).default(30),
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
});

export type ReportingConfig = z.infer<typeof configSchema>;

/** Ошибка конфигурации: только имена ключей, ни одного значения. */
export class ReportingConfigError extends Error {
  readonly keys: string[];

  constructor(keys: string[]) {
    super(`Некорректная конфигурация отчётного API: ${keys.join(', ')}`);
    this.name = 'ReportingConfigError';
    this.keys = keys;
  }
}

/**
 * Доменная HTTP-ошибка отчётного контура.
 *
 * Живёт здесь, чтобы маршруты и обработчик ошибок не зависели друг от друга по кругу.
 * `message` безопасен для клиента: SQL, имена таблиц и строка подключения в него не попадают.
 */
export class ReportingError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly retryAfterSeconds: number | null;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'ReportingError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Разбор окружения в конфигурацию. Ключи в ошибке — без значений. */
export function readReportingConfig(env: NodeJS.ProcessEnv): ReportingConfig {
  const parsed = configSchema.safeParse(env);
  if (parsed.success) {
    return parsed.data;
  }
  const keys = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')))].filter(
    (key) => key.length > 0,
  );
  throw new ReportingConfigError(keys.length > 0 ? keys : ['конфигурация']);
}
