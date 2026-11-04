/**
 * Клиент отчётов `/api/reports/*` (D12).
 *
 * Инварианты:
 *  - адрес сервиса берётся только из `VITE_REPORT_API_URL`, токен — из публичного
 *    `VITE_REPORT_API_TOKEN`; `service_role`, строка primary и `DATABASE_URL*` в клиент
 *    не попадают (A12.6, DEC-025);
 *  - ответы валидируются Zod по схемам openapi: неизвестные поля (например `email`)
 *    отбрасываются до рендера (A12.5);
 *  - 503 переводится в типизированную `ReplicaUnavailable`, чтобы экран показал локальную
 *    деградацию, а не глобальную ошибку приложения (A12.4);
 *  - таймаут 5 с (NFR14), токен не пишется в URL, в `localStorage` и в тексты ошибок (INV-007);
 *  - клиент не считает агрегаты: числа приходят готовыми с реплики (INV-011).
 */
/// <reference types="vite/client" />
import { z } from 'zod';

/** Схемы строк — повторяют openapi `ObjectReportRow`, `WorkloadRow`, `StatusAgeRow`. */
const objectReportRowSchema = z.object({
  object_id: z.string().uuid(),
  title: z.string(),
  address: z.string(),
  tasks_total: z.number().int().min(0),
  tasks_new: z.number().int().min(0),
  tasks_in_progress: z.number().int().min(0),
  tasks_on_review: z.number().int().min(0),
  tasks_rework: z.number().int().min(0),
  tasks_accepted: z.number().int().min(0),
  accepted_share: z.number().min(0).max(100),
  last_activity_at: z.string().nullable(),
});

const workloadRowSchema = z.object({
  assignee_id: z.string().uuid(),
  full_name: z.string(),
  tasks_total: z.number().int().min(0),
  tasks_in_progress: z.number().int().min(0),
  tasks_on_review: z.number().int().min(0),
  tasks_rework: z.number().int().min(0),
  tasks_accepted: z.number().int().min(0),
  oldest_open_at: z.string().nullable(),
});

const statusAgeRowSchema = z.object({
  day: z.string().min(1),
  avg_seconds_in_status: z.number().min(0),
  max_seconds_in_status: z.number().min(0),
});

export type ObjectReportRow = z.infer<typeof objectReportRowSchema>;
export type WorkloadRow = z.infer<typeof workloadRowSchema>;
export type StatusAgeRow = z.infer<typeof statusAgeRowSchema>;

/** Пути отчётов: только эти три операции, других клиент не знает. */
export type ReportPath = 'objects' | 'workload' | 'status-ages';

export interface ReportEnvelope<T> {
  source: 'replica';
  lag_seconds: number;
  generated_at: string;
  data: T[];
}

const envelopeBaseSchema = {
  source: z.literal('replica'),
  lag_seconds: z.number().min(0),
  generated_at: z.string().min(1),
} as const;

const objectEnvelopeSchema = z.object({
  ...envelopeBaseSchema,
  data: z.array(objectReportRowSchema),
});
const workloadEnvelopeSchema = z.object({
  ...envelopeBaseSchema,
  data: z.array(workloadRowSchema),
});
const statusAgeEnvelopeSchema = z.object({
  ...envelopeBaseSchema,
  data: z.array(statusAgeRowSchema),
});

/** Схема ответа по пути: одна точка правды для рантайма и типов. */
const ENVELOPES = {
  objects: objectEnvelopeSchema,
  workload: workloadEnvelopeSchema,
  'status-ages': statusAgeEnvelopeSchema,
} as const;

const reportEnvSchema = z.object({
  VITE_REPORT_API_URL: z.string().url(),
  VITE_REPORT_API_TOKEN: z.string().min(1),
});

export interface ReportClientConfig {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** 503 от реплики: экран обязан показать деградацию, а не пустую таблицу. */
export class ReplicaUnavailable extends Error {
  readonly code: string;
  readonly retryAfterSeconds: number | null;

  constructor(code: string, retryAfterSeconds: number | null) {
    super('Отчёты временно недоступны: реплика не отвечает');
    this.name = 'ReplicaUnavailable';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Прочие отказы клиента: сеть, таймаут, несоответствие контракту. */
export class ReportRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ReportRequestError';
    this.status = status;
  }
}

export interface ReportApi {
  getReport(path: ReportPath): Promise<ReportEnvelope<unknown>>;
}

function parseRetryAfter(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function readErrorCode(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    const parsed = z.object({ error: z.object({ code: z.string() }) }).safeParse(payload);
    return parsed.success ? parsed.data.error.code : 'E_REPLICA_DOWN';
  } catch {
    return 'E_REPLICA_DOWN';
  }
}

/** Создаёт клиент над конкретным адресом: тесты подменяют `fetchImpl` без сети. */
export function createReportApi(config: ReportClientConfig): ReportApi {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const timeoutMs = config.timeoutMs ?? 5_000;
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async getReport(path: ReportPath): Promise<ReportEnvelope<unknown>> {
      // `AbortSignal.timeout` не оставляет висящего таймера после ответа (NFR14).
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/api/reports/${path}`, {
          method: 'GET',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${config.token}`,
          },
          // Куки и credentials не нужны: доступ даёт токен, CORS без credentials.
          credentials: 'omit',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const timedOut =
          error instanceof Error &&
          (error.name === 'AbortError' || error.name === 'TimeoutError');
        throw new ReportRequestError(
          timedOut ? 'Сервис отчётов не ответил вовремя' : 'Не удалось связаться с сервисом отчётов',
        );
      }

      if (response.status === 503) {
        throw new ReplicaUnavailable(
          await readErrorCode(response),
          parseRetryAfter(response.headers.get('retry-after')),
        );
      }
      if (!response.ok) {
        throw new ReportRequestError('Сервис отчётов вернул ошибку', response.status);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ReportRequestError('Ответ отчёта не читается', 502);
      }
      const parsed = ENVELOPES[path].safeParse(payload);
      if (!parsed.success) {
        // Поля вне контракта уже отброшены Zod: email и description не доходят до UI.
        throw new ReportRequestError('Ответ отчёта не соответствует контракту', 502);
      }
      return parsed.data;
    },
  };
}

let cachedApi: ReportApi | null = null;

/** Клиент из окружения сборки; читается лениво, чтобы тесты могли подменить env. */
export function getReportApi(): ReportApi {
  if (cachedApi !== null) return cachedApi;
  const parsed = reportEnvSchema.safeParse(import.meta.env);
  if (!parsed.success) {
    throw new ReportRequestError(
      'Некорректная конфигурация отчётов: VITE_REPORT_API_URL, VITE_REPORT_API_TOKEN',
    );
  }
  cachedApi = createReportApi({
    baseUrl: parsed.data.VITE_REPORT_API_URL,
    token: parsed.data.VITE_REPORT_API_TOKEN,
  });
  return cachedApi;
}

/** Сброс кэша клиента: нужен тестам после `vi.stubEnv`. */
export function resetReportApiForTests(): void {
  cachedApi = null;
}
