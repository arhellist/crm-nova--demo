/**
 * A11.4 — загрузка исполнителей: агрегаты отчёта совпадают с независимым пересчётом
 * десяти задач в трёх статусах.
 *
 * Реплика в unit-контуре недоступна, поэтому проверяются два слоя, которые дают числа:
 *  - SQL вьюхи `report_workload` (читается из `infra/replica/init/020_views.sql`): фильтры
 *    `archived_at is null` / `role = 'executor'`, счётчики по статусам, только `full_name`;
 *  - конвейер отчёта: ряд вьюхи → валидация Zod → конверт ответа без потери счётчиков.
 * Живая сверка с primary выполняется волновым smoke после `reports` (проверка `check.mjs`).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { QueryRows } from './db.js';
import type { ReplicationState } from './db.js';
import { buildReportingServer } from './server.js';
import { clearReportCache } from './routes/reports.js';

const TOKEN = 'reporting-token-0123456789abcdef';
const STREAMING: ReplicationState = { status: 'streaming', lag_seconds: 1, last_error: null };

const VIEWS_SQL = readFileSync(
  new URL('../../infra/replica/init/020_views.sql', import.meta.url),
  'utf8',
);

/** Десять задач в трёх статусах на двух исполнителей — исходные данные для сверки. */
type Status = 'in_progress' | 'on_review' | 'accepted';

interface TaskFixture {
  assigneeId: string;
  status: Status;
}

const ASSIGNEE_A = '33333333-3333-4333-8333-333333333333';
const ASSIGNEE_B = '44444444-4444-4444-8444-444444444444';

const TASKS: readonly TaskFixture[] = [
  { assigneeId: ASSIGNEE_A, status: 'in_progress' },
  { assigneeId: ASSIGNEE_A, status: 'in_progress' },
  { assigneeId: ASSIGNEE_A, status: 'on_review' },
  { assigneeId: ASSIGNEE_A, status: 'accepted' },
  { assigneeId: ASSIGNEE_A, status: 'accepted' },
  { assigneeId: ASSIGNEE_B, status: 'in_progress' },
  { assigneeId: ASSIGNEE_B, status: 'in_progress' },
  { assigneeId: ASSIGNEE_B, status: 'on_review' },
  { assigneeId: ASSIGNEE_B, status: 'on_review' },
  { assigneeId: ASSIGNEE_B, status: 'accepted' },
];

/** Независимый пересчёт: тот же смысл, что у вьюхи, но на чистом TypeScript. */
function expectedWorkload(): Array<Record<string, unknown>> {
  const byAssignee = new Map<string, TaskFixture[]>();
  for (const task of TASKS) {
    const list = byAssignee.get(task.assigneeId) ?? [];
    list.push(task);
    byAssignee.set(task.assigneeId, list);
  }
  return [...byAssignee.entries()]
    .map(([assigneeId, tasks]) => ({
      assignee_id: assigneeId,
      full_name: assigneeId === ASSIGNEE_A ? 'Анна Смирнова' : 'Борис Ковалёв',
      tasks_total: tasks.length,
      tasks_new: 0,
      tasks_in_progress: tasks.filter((task) => task.status === 'in_progress').length,
      tasks_on_review: tasks.filter((task) => task.status === 'on_review').length,
      tasks_rework: 0,
      tasks_accepted: tasks.filter((task) => task.status === 'accepted').length,
      oldest_open_at: '2026-10-28T07:00:00.000Z',
    }))
    .sort((left, right) => right.tasks_total - left.tasks_total || left.full_name.localeCompare(right.full_name));
}

/** Срез вьюхи `report_workload`: до следующей вьюхи, чтобы не захватить чужие колонки. */
function workloadViewSql(): string {
  const start = VIEWS_SQL.indexOf('create or replace view public.report_workload');
  expect(start).toBeGreaterThan(-1);
  const end = VIEWS_SQL.indexOf('create or replace view public.report_status_ages', start);
  // Только само определение вьюхи: `comment on view` — служебный DDL, а не колонка.
  const statementEnd = VIEWS_SQL.indexOf(';', start);
  const limit = end === -1 ? statementEnd : Math.min(end, statementEnd === -1 ? end : statementEnd);
  return VIEWS_SQL.slice(start, limit + 1);
}

describe('A11.4 загрузка исполнителей', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const rows = expectedWorkload();
    const query: QueryRows = async (sql) => (sql.includes('report_workload') ? rows : []);
    app = await buildReportingServer({
      apiToken: TOKEN,
      allowedOrigins: ['https://crm.example.test'],
      query,
      getReplicationState: async () => STREAMING,
      cacheTtlMs: 30_000,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('A11.4 отчёт совпадает с пересчётом 10 задач в трёх статусах', async () => {
    clearReportCache();
    const response = await app.inject({
      method: 'GET',
      url: '/api/reports/workload',
      headers: { authorization: `Bearer ${TOKEN}` },
      remoteAddress: '10.4.0.1',
    });
    expect(response.statusCode).toBe(200);

    const expected = expectedWorkload();
    const body = response.json() as { data: Array<Record<string, number | string | null>> };
    expect(body.data).toHaveLength(2);
    for (const [index, row] of body.data.entries()) {
      const reference = expected[index] as Record<string, unknown>;
      expect(row.assignee_id).toBe(reference.assignee_id);
      expect(row.tasks_total).toBe(reference.tasks_total);
      expect(row.tasks_in_progress).toBe(reference.tasks_in_progress);
      expect(row.tasks_on_review).toBe(reference.tasks_on_review);
      expect(row.tasks_rework).toBe(0);
      expect(row.tasks_accepted).toBe(reference.tasks_accepted);
      // Инвариант вьюхи: сумма статусных счётчиков равна общему числу активных задач.
      expect(
        Number(row.tasks_new) +
          Number(row.tasks_in_progress) +
          Number(row.tasks_on_review) +
          Number(row.tasks_rework) +
          Number(row.tasks_accepted),
      ).toBe(Number(row.tasks_total));
    }
    // 10 задач: 4 in_progress, 3 on_review, 3 accepted.
    expect(
      body.data.reduce((sum, row) => sum + Number(row.tasks_in_progress), 0),
    ).toBe(4);
    expect(body.data.reduce((sum, row) => sum + Number(row.tasks_on_review), 0)).toBe(3);
    expect(body.data.reduce((sum, row) => sum + Number(row.tasks_accepted), 0)).toBe(3);
  });

  it('A11.4 вьюха считает те же статусы и не выносит ПДн исполнителя', () => {
    const sql = workloadViewSql();
    expect(sql).toMatch(/from public\.profiles p/);
    expect(sql).toMatch(/left join public\.tasks t/);
    expect(sql).toMatch(/t\.assignee_id = p\.id/);
    expect(sql).toMatch(/where p\.role = 'executor'/);
    expect(sql).toMatch(/group by p\.id, p\.full_name/);
    for (const status of ['new', 'in_progress', 'on_review', 'rework', 'accepted']) {
      expect(sql).toContain(`t.status = '${status}'`);
    }
    expect(sql).not.toMatch(/\bemail\b/i);
    expect(sql).not.toMatch(/\bdescription\b/i);
    expect(sql).not.toMatch(/\bcomment\b/i);
  });
});
