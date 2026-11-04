/**
 * Отчётные маршруты: три агрегата с реплики, честная метка источника и лага.
 *
 * Инварианты:
 *  - до обращения к БД проверяется состояние подписки: `broken` → 503 `E_REPLICA_DOWN`,
 *    `lagging` → 503 `E_REPLICA_LAG` с `retry_after` (A11.6, NFR7);
 *  - читаются только вьюхи D10 (`report_objects`, `report_workload`, `report_status_ages`),
 *    ни одной базовой таблицы и ни одного `select *` — ПДн и комментарии не выгружаются (A11.5);
 *  - ответ всегда содержит `source: "replica"`, `lag_seconds`, `generated_at` (openapi Envelope);
 *  - кэш в процессе на `REPORT_CACHE_TTL_S` (максимум 30 с по умолчанию): ключ включает
 *    маршрут и параметры периода, поэтому чужой запрос не отдаёт чужие данные;
 *  - `from`/`to` — календарные сутки Europe/Moscow; `limit` — 1..100.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ReportingError } from '../config.js';
import type { QueryRows, ReplicationState } from '../db.js';

/** Параметры периода и лимита: невалидный ввод — 400 до запроса к БД. */
const querySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата ГГГГ-ММ-ДД')
    .nullish()
    .transform((value) => value ?? null),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата ГГГГ-ММ-ДД')
    .nullish()
    .transform((value) => value ?? null),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const objectReportRowSchema = z.object({
  object_id: z.string().uuid(),
  title: z.string(),
  address: z.string(),
  tasks_total: z.coerce.number().int().min(0),
  tasks_new: z.coerce.number().int().min(0),
  tasks_in_progress: z.coerce.number().int().min(0),
  tasks_on_review: z.coerce.number().int().min(0),
  tasks_rework: z.coerce.number().int().min(0),
  tasks_accepted: z.coerce.number().int().min(0),
  accepted_share: z.coerce.number().min(0).max(100),
  last_activity_at: z.string().nullable(),
});

const workloadRowSchema = z.object({
  assignee_id: z.string().uuid(),
  full_name: z.string(),
  tasks_total: z.coerce.number().int().min(0),
  tasks_in_progress: z.coerce.number().int().min(0),
  tasks_on_review: z.coerce.number().int().min(0),
  tasks_rework: z.coerce.number().int().min(0),
  tasks_accepted: z.coerce.number().int().min(0),
  oldest_open_at: z.string().nullable(),
});

const statusAgeRowSchema = z.object({
  day: z.string().min(1),
  avg_seconds_in_status: z.coerce.number().min(0),
  max_seconds_in_status: z.coerce.number().min(0),
});

/** SQL отчётов: только вьюхи, параметры передаются значениями, без конкатенации. */
export const REPORT_SQL = {
  objects: `select id::text as object_id,
       title,
       address,
       tasks_total::int as tasks_total,
       tasks_new::int as tasks_new,
       tasks_in_progress::int as tasks_in_progress,
       tasks_on_review::int as tasks_on_review,
       tasks_rework::int as tasks_rework,
       tasks_accepted::int as tasks_accepted,
       accepted_share::float8 as accepted_share,
       last_activity_at
  from public.report_objects
 where ($1::date is null or (last_activity_at at time zone 'Europe/Moscow')::date >= $1::date)
   and ($2::date is null or (last_activity_at at time zone 'Europe/Moscow')::date <= $2::date)
 order by title asc, id asc
 limit $3`,
  workload: `select assignee_id::text as assignee_id,
       full_name,
       tasks_total::int as tasks_total,
       tasks_in_progress::int as tasks_in_progress,
       tasks_on_review::int as tasks_on_review,
       tasks_rework::int as tasks_rework,
       tasks_accepted::int as tasks_accepted,
       oldest_open_at
  from public.report_workload
 where ($1::date is null or (oldest_open_at at time zone 'Europe/Moscow')::date >= $1::date)
   and ($2::date is null or (oldest_open_at at time zone 'Europe/Moscow')::date <= $2::date)
 order by tasks_total desc, full_name asc
 limit $3`,
  statusAges: `select to_char(day, 'YYYY-MM-DD') as day,
       avg_seconds_in_status::float8 as avg_seconds_in_status,
       max_seconds_in_status::float8 as max_seconds_in_status
  from public.report_status_ages
 where ($1::date is null or day >= $1::date)
   and ($2::date is null or day <= $2::date)
 order by day desc
 limit $3`,
} as const;

/** Счётчики кэша для `/metrics`; сбрасываются только тестами. */
export const reportCacheStats = { hit: 0, miss: 0 };

interface CacheEntry {
  expiresAt: number;
  data: unknown[];
}

const cache = new Map<string, CacheEntry>();

/** Очистка кэша: нужна тестам и деградации (данные реплики устарели — кэш не отдаём). */
export function clearReportCache(): void {
  cache.clear();
  reportCacheStats.hit = 0;
  reportCacheStats.miss = 0;
}

export interface ReportDeps {
  query: QueryRows;
  getReplicationState: () => Promise<ReplicationState>;
  cacheTtlMs: number;
  now?: () => Date;
}

/** Состояние реплики перед отчётом: деградация не должна отдавать устаревшие данные. */
async function requireFreshReplica(deps: ReportDeps): Promise<ReplicationState> {
  const state = await deps.getReplicationState();
  if (state.status === 'broken') {
    throw new ReportingError(
      503,
      'E_REPLICA_DOWN',
      'Данные отчёта временно недоступны: реплика не отвечает',
      30,
    );
  }
  if (state.status === 'lagging') {
    throw new ReportingError(
      503,
      'E_REPLICA_LAG',
      'Данные отчёта временно недоступны: реплика отстаёт',
      30,
    );
  }
  return state;
}

/** Ответ по openapi Envelope: источник, лаг и время формирования обязательны. */
function envelope(data: unknown[], state: ReplicationState, now: Date): Record<string, unknown> {
  return {
    source: 'replica',
    lag_seconds: state.lag_seconds,
    generated_at: now.toISOString(),
    data,
  };
}

interface ReportDefinition {
  name: 'objects' | 'workload' | 'status-ages';
  sql: string;
  schema: z.ZodTypeAny;
}

const REPORTS: readonly ReportDefinition[] = [
  { name: 'objects', sql: REPORT_SQL.objects, schema: objectReportRowSchema },
  { name: 'workload', sql: REPORT_SQL.workload, schema: workloadRowSchema },
  { name: 'status-ages', sql: REPORT_SQL.statusAges, schema: statusAgeRowSchema },
];

type ParsedQuery = { from: string | null; to: string | null; limit: number };

/** Валидирует query-параметры отчёта и превращает ошибку Zod в 400 без деталей SQL. */
function parseQuery(raw: unknown): ParsedQuery {
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    throw new ReportingError(400, 'E_VALIDATION', 'Проверьте параметры отчёта');
  }
  return parsed.data;
}

/** Ряды из БД валидируются Zod: неожиданная колонка не утечёт в ответ. */
function validateRows(rows: unknown[], schema: z.ZodTypeAny): unknown[] {
  const parsed = z.array(schema).safeParse(rows);
  if (!parsed.success) {
    throw new ReportingError(500, 'E_INTERNAL', 'Не удалось подготовить отчёт');
  }
  return parsed.data;
}

export function registerReportRoutes(app: FastifyInstance, deps: ReportDeps): void {
  const now = deps.now ?? (() => new Date());

  for (const report of REPORTS) {
    app.get(`/api/reports/${report.name}`, async (request, reply) => {
      const query = parseQuery(request.query);
      const state = await requireFreshReplica(deps);

      const cacheKey = `${report.name}|${query.from ?? ''}|${query.to ?? ''}|${query.limit}`;
      const cached = cache.get(cacheKey);
      const generatedAt = now();
      if (cached && cached.expiresAt > generatedAt.getTime()) {
        reportCacheStats.hit += 1;
        return reply.send(envelope(cached.data, state, generatedAt));
      }

      reportCacheStats.miss += 1;
      const rows = await deps.query(report.sql, [query.from, query.to, query.limit]);
      const data = validateRows(rows, report.schema);
      cache.set(cacheKey, {
        data,
        expiresAt: generatedAt.getTime() + deps.cacheTtlMs,
      });
      return reply.send(envelope(data, state, generatedAt));
    });
  }
}
