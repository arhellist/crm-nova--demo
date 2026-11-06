/**
 * A11.1, A11.2, A11.5 — отчётные маршруты: конверт ответа, защита и отсутствие ПДн.
 *
 * БД подменена функцией `query`: тесты доказывают, что до неё не доходит неавторизованный
 * запрос, а тело ответа собирается только из вьюх D10. SQL-тексты проверяются отдельно:
 * ни одной базовой таблицы и ни одного `select *` (A11.5, INV-011).
 */
import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { QueryRows, ReplicationState } from '../db.js';
import { buildReportingServer } from '../server.js';
import { clearReportCache, REPORT_SQL } from './reports.js';

const TOKEN = 'reporting-token-0123456789abcdef';
const ORIGIN = 'https://crm.example.test';

const OBJECT_ROW = {
  object_id: '11111111-1111-4111-8111-111111111111',
  title: 'ЖК Северный, корпус 1',
  address: 'г. Москва, ул. Строителей, 1',
  tasks_total: 4,
  tasks_new: 1,
  tasks_in_progress: 2,
  tasks_on_review: 1,
  tasks_rework: 0,
  tasks_accepted: 0,
  accepted_share: 0,
  last_activity_at: '2026-11-01T09:00:00.000Z',
};

const WORKLOAD_ROW = {
  assignee_id: '22222222-2222-4222-8222-222222222222',
  full_name: 'Иван Петров',
  tasks_total: 3,
  tasks_new: 0,
  tasks_in_progress: 2,
  tasks_on_review: 1,
  tasks_rework: 0,
  tasks_accepted: 0,
  oldest_open_at: '2026-10-30T08:00:00.000Z',
};

const STATUS_AGE_ROW = {
  day: '2026-11-01',
  avg_seconds_in_status: 7200.5,
  max_seconds_in_status: 86_400,
};

const STREAMING: ReplicationState = { status: 'streaming', lag_seconds: 2, last_error: null };

function createQuery(): QueryRows & ReturnType<typeof vi.fn> {
  return vi.fn(async (sql: string) => {
    if (sql.includes('report_objects')) return [OBJECT_ROW];
    if (sql.includes('report_workload')) return [WORKLOAD_ROW];
    return [STATUS_AGE_ROW];
  }) as unknown as QueryRows & ReturnType<typeof vi.fn>;
}

/** Собирает все ключи объекта рекурсивно: ПДн не должны появляться ни на одном уровне. */
function collectKeys(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, acc);
    return acc;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, nested] of Object.entries(value)) {
      acc.add(key);
      collectKeys(nested, acc);
    }
  }
  return acc;
}

describe('A11.1 / A11.2 / A11.5 отчётный API', () => {
  let app: FastifyInstance;
  let query: QueryRows & ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    query = createQuery();
    app = await buildReportingServer({
      apiToken: TOKEN,
      allowedOrigins: [ORIGIN],
      query,
      getReplicationState: async () => STREAMING,
      cacheTtlMs: 30_000,
      now: () => new Date('2026-11-04T12:00:00.000Z'),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    clearReportCache();
    query.mockClear();
  });

  it('A11.1 GET /api/reports/objects отдаёт конверт replica с лагом ≤ 5 с', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/reports/objects',
      headers: { authorization: `Bearer ${TOKEN}`, origin: ORIGIN },
      remoteAddress: '10.2.0.1',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.source).toBe('replica');
    expect(body.lag_seconds).toBeLessThanOrEqual(5);
    expect(body.generated_at).toBe('2026-11-04T12:00:00.000Z');
    expect(body.data).toEqual([OBJECT_ROW]);
    // Параметры периода по умолчанию: без дат, лимит 50.
    expect(query).toHaveBeenCalledWith(REPORT_SQL.objects, [null, null, 50]);
  });

  it('A11.2 без токена — 401, чужой Origin — 403, POST — 405; БД не затронута', async () => {
    const withoutToken = await app.inject({
      method: 'GET',
      url: '/api/reports/objects',
      remoteAddress: '10.2.0.2',
    });
    expect(withoutToken.statusCode).toBe(401);
    expect(withoutToken.json()).toMatchObject({ error: { code: 'E_UNAUTHORIZED' } });

    const foreignOrigin = await app.inject({
      method: 'GET',
      url: '/api/reports/objects',
      headers: { authorization: `Bearer ${TOKEN}`, origin: 'https://evil.example.test' },
      remoteAddress: '10.2.0.3',
    });
    expect(foreignOrigin.statusCode).toBe(403);
    expect(foreignOrigin.json()).toMatchObject({ error: { code: 'E_FORBIDDEN_ORIGIN' } });

    const post = await app.inject({
      method: 'POST',
      url: '/api/reports/objects',
      headers: { authorization: `Bearer ${TOKEN}` },
      remoteAddress: '10.2.0.4',
    });
    expect(post.statusCode).toBe(405);
    expect(post.json()).toMatchObject({ error: { code: 'E_METHOD_NOT_ALLOWED' } });

    // Ни один из запросов не дошёл до выборки из реплики.
    expect(query).not.toHaveBeenCalled();
  });

  it('A11.5 в ответах всех отчётов нет email, description и comment', async () => {
    for (const name of ['objects', 'workload', 'status-ages'] as const) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/reports/${name}`,
        headers: { authorization: `Bearer ${TOKEN}` },
        remoteAddress: '10.2.0.5',
      });
      expect(response.statusCode).toBe(200);
      const keys = collectKeys(response.json());
      expect([...keys]).not.toContain('email');
      expect([...keys]).not.toContain('description');
      expect([...keys]).not.toContain('comment');
      expect(response.body).not.toMatch(/"email"|"description"|"comment"/);
    }
  });

  it('A11.5 SQL отчётов читает только вьюхи, без select * и базовых таблиц', () => {
    for (const sql of Object.values(REPORT_SQL)) {
      expect(sql).not.toMatch(/select\s+\*/i);
      expect(sql).toMatch(/from public\.report_/);
      expect(sql).not.toMatch(/from public\.(profiles|tasks|task_status_history|objects)\b/);
      expect(sql).toMatch(/^select /);
      expect(sql).not.toMatch(/\b(insert|update|delete)\b/i);
    }
  });

  it('A11.1 валидирует период: неверная дата — 400 до запроса к БД', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/reports/objects?from=01.11.2026',
      headers: { authorization: `Bearer ${TOKEN}` },
      remoteAddress: '10.2.0.6',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'E_VALIDATION' } });
    expect(query).not.toHaveBeenCalled();
  });
});
