/**
 * Единственный источник правды о конфигурации backend.
 *
 * Инварианты (D01, INVARIANTS 1–2, INV-006):
 *  - переменные окружения читаются только здесь; прямых `process.env.*` в остальном коде нет;
 *  - обязательная переменная отсутствует или невалидна → процесс завершается с кодом 1,
 *    в stderr печатаются ТОЛЬКО имена ключей, значения не раскрываются (INV-007);
 *  - экспортируемый объект заморожен: модуль не может случайно поменять конфигурацию в рантайме.
 *
 * Границы: сюда попадают только переменные из `OUTPUT/tooling/env-vars.md`. Секреты
 * (`DATABASE_URL`, `API_TOKEN`, `service_role`) не имеют префикса `VITE_` и в бандл не попадают.
 */
import { z } from 'zod';

/** Ошибка валидации конфигурации: содержит только имена ключей, без значений. */
export class EnvValidationError extends Error {
  readonly keys: string[];

  constructor(keys: string[]) {
    super(`Некорректная конфигурация окружения: ${keys.join(', ')}`);
    this.name = 'EnvValidationError';
    this.keys = keys;
  }
}

/**
 * Схема окружения. Дефолты совпадают с колонкой `local` в `env-vars.md`;
 * `coerce` нужен потому, что окружение отдаёт строки.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Supabase Auth/PostgREST: обязателен, без него приложение не стартует (A01.1).
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  // Токен периметра API: короткий токен не принимаем, чтобы не завести «dev-заглушку» в prod.
  API_TOKEN: z.string().min(16),
  // Реплика только для чтения; primary в конфигурации backend отсутствует намеренно (INV-001).
  DATABASE_URL: z.string().min(1),
  ALLOWED_ORIGINS: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  REPORT_CACHE_TTL_MS: z.coerce.number().int().positive().max(300_000).default(30_000),
  REPLICA_LAG_ALERT_SECONDS: z.coerce.number().int().positive().max(3_600).default(30),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  SENTRY_DSN: z
    .union([z.string().url(), z.literal('')])
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  // Метаданные деплоя: коммит подставляет CI, локально — `dev`.
  GIT_COMMIT: z.string().min(1).default('dev'),
});

export type AppEnv = Readonly<z.infer<typeof envSchema>>;

/**
 * Разбирает переданный снимок окружения. Бросает `EnvValidationError` со списком ключей:
 * значения не попадают ни в сообщение, ни в лог.
 */
export function parseEnv(source: NodeJS.ProcessEnv): AppEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const keys = [
      ...new Set(
        result.error.issues.map((issue) => {
          const [key] = issue.path;
          return typeof key === 'string' ? key : '(unknown)';
        }),
      ),
    ].sort();
    throw new EnvValidationError(keys);
  }
  return Object.freeze(result.data);
}

/**
 * Разбор при импорте: любая ошибка — печать имён ключей в stderr и выход с кодом 1.
 * Возврат `never` делает явным, что после ошибки процесс не продолжает работу.
 */
function loadEnvOrExit(): AppEnv {
  try {
    return parseEnv(process.env);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
    } else {
      console.error('Некорректная конфигурация окружения');
    }
    process.exit(1);
  }
}

/** Замороженная конфигурация процесса; читать только отсюда. */
export const env: AppEnv = loadEnvOrExit();
