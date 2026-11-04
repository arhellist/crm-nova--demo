/**
 * check.mjs — сверка контура отчётности с primary.
 *
 * Что проверяется (D10):
 *  - подписка `nova_sub` существует и находится в состоянии streaming;
 *  - лаг `pg_stat_subscription.last_msg_receipt_time` не больше порога (NFR7);
 *  - `count(*)` и последняя метка изменения четырёх таблиц совпадают с primary (A10.3);
 *  - роль `nova_ro` не пишет: `insert` отклоняется кодом `25006` (A10.4, INV-011).
 *
 * Инварианты:
 *  - параметры берутся только из env: строки подключения не попадают в argv, логи и git (INV-006);
 *  - тексты ошибок наружу не содержат conninfo и SQL — только имена таблиц и коды;
 *  - exit 0 только если все проверки прошли; 1 — расхождение/не-streaming/запись удалась;
 *    2 — некорректная конфигурация (нет переменной), значения не печатаются.
 *
 * Запуск: `node infra/replica/check.mjs` (в CI и по расписанию, ADR-0003).
 */
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';

/**
 * Четыре публикуемые таблицы. У `profiles` и истории нет `updated_at` — берём `created_at`,
 * поэтому «последняя метка изменения» для них означает последнюю вставку.
 */
export const TABLES = [
  { table: 'profiles', timestamp: 'created_at' },
  { table: 'objects', timestamp: 'updated_at' },
  { table: 'tasks', timestamp: 'updated_at' },
  { table: 'task_status_history', timestamp: 'created_at' },
];

/** Порог лага по умолчанию: NFR7 — p95 ≤ 5 с. */
export const DEFAULT_LAG_MAX_SECONDS = 5;

/** Ошибка конфигурации: перечисляет только имена ключей, без значений (INV-007). */
export class CheckConfigError extends Error {
  /** @param {string[]} keys */
  constructor(keys) {
    super(`Не заданы переменные окружения: ${keys.join(', ')}`);
    this.name = 'CheckConfigError';
    this.keys = keys;
  }
}

/**
 * Читает конфигурацию из env.
 * @param {Record<string, string | undefined>} env
 */
export function readConfig(env) {
  const required = ['PRIMARY_DATABASE_URL', 'REPLICA_DATABASE_URL', 'NOVA_RO_URL'];
  const missing = required.filter((key) => {
    const value = env[key];
    return typeof value !== 'string' || value.trim().length === 0;
  });
  if (missing.length > 0) {
    throw new CheckConfigError(missing);
  }

  const rawLag = env.LAG_MAX_SECONDS;
  const lagMax = rawLag === undefined ? DEFAULT_LAG_MAX_SECONDS : Number(rawLag);
  if (!Number.isFinite(lagMax) || lagMax <= 0) {
    throw new CheckConfigError(['LAG_MAX_SECONDS']);
  }

  return {
    primaryUrl: env.PRIMARY_DATABASE_URL,
    replicaUrl: env.REPLICA_DATABASE_URL,
    novaRoUrl: env.NOVA_RO_URL,
    lagMaxSeconds: lagMax,
  };
}

/**
 * Снимок таблицы: число строк и последняя метка изменения.
 * Имена таблицы и колонки — из константы TABLES, внешний ввод в SQL не попадает.
 * @param {import('pg').Client} client
 * @param {{ table: string, timestamp: string }} target
 */
export async function tableStats(client, target) {
  const sql = `select count(*)::bigint as rows, max(${target.timestamp})::text as last_change from public.${target.table}`;
  const result = await client.query(sql);
  const row = result.rows[0] ?? { rows: '0', last_change: null };
  return { rows: String(row.rows), last_change: row.last_change ?? null };
}

/**
 * Сравнивает снимки primary и реплики.
 * @param {Record<string, { rows: string, last_change: string | null }>} primary
 * @param {Record<string, { rows: string, last_change: string | null }>} replica
 * @returns {string[]} человекочитаемые расхождения без секретов
 */
export function compareStats(primary, replica) {
  const problems = [];
  for (const { table } of TABLES) {
    const left = primary[table];
    const right = replica[table];
    if (!left || !right) {
      problems.push(`${table}: нет снимка`);
      continue;
    }
    if (left.rows !== right.rows) {
      problems.push(`${table}: строк ${right.rows}, на primary ${left.rows}`);
    }
    if (left.last_change !== right.last_change) {
      problems.push(`${table}: последняя метка ${right.last_change ?? '—'}, на primary ${left.last_change ?? '—'}`);
    }
  }
  return problems;
}

/**
 * Разбирает строку `pg_stat_subscription`: подписка streaming, если у неё есть pid.
 * @param {{ pid: number | string | null, last_error: string | null, lag_seconds: string | number | null } | undefined} row
 * @param {number} lagMaxSeconds
 */
export function readSubscription(row, lagMaxSeconds) {
  if (!row) {
    return { streaming: false, lagSeconds: null, lastError: null, problems: ['подписка nova_sub не найдена'] };
  }
  const lagSeconds = row.lag_seconds === null || row.lag_seconds === undefined ? null : Number(row.lag_seconds);
  const streaming = row.pid !== null && row.pid !== undefined;
  const problems = [];
  if (!streaming) {
    problems.push('подписка nova_sub не в состоянии streaming');
  }
  if (lagSeconds === null) {
    problems.push('лаг подписки неизвестен');
  } else if (lagSeconds > lagMaxSeconds) {
    problems.push(`лаг ${lagSeconds.toFixed(1)} с больше порога ${lagMaxSeconds} с`);
  }
  if (row.last_error) {
    problems.push(`последняя ошибка подписки: ${row.last_error}`);
  }
  return { streaming, lagSeconds, lastError: row.last_error ?? null, problems };
}

/** Запись от `nova_ro` отклонена read-only транзакцией (A10.4). */
export function isReadOnlyViolation(error) {
  return typeof error === 'object' && error !== null && /** @type {{ code?: string }} */ (error).code === '25006';
}

/**
 * Проверка запрета записи: insert обязан упасть с 25006, иначе роль пишет.
 * @param {import('pg').Client} client
 */
export async function assertReadOnly(client) {
  try {
    await client.query("insert into public.objects (title, address) values ('check', 'check')");
  } catch (error) {
    if (isReadOnlyViolation(error)) {
      return { ok: true, code: '25006' };
    }
    const code = typeof error === 'object' && error !== null ? /** @type {{ code?: string }} */ (error).code ?? null : null;
    return { ok: false, code, reason: `запись отклонена не read-only ошибкой (код ${code ?? '—'})` };
  }
  return { ok: false, code: null, reason: 'insert от nova_ro не был отклонён' };
}

/** Клиент с таймаутом запроса: зависшая проверка не держит CI. */
function createClient(connectionString) {
  return new Client({ connectionString, statement_timeout: 3000, query_timeout: 3000 });
}

async function collectStats(client, label) {
  /** @type {Record<string, { rows: string, last_change: string | null }>} */
  const stats = {};
  for (const target of TABLES) {
    try {
      stats[target.table] = await tableStats(client, target);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${label}: не удалось прочитать ${target.table}: ${message}`);
    }
  }
  return stats;
}

async function main() {
  let config;
  try {
    config = readConfig(process.env);
  } catch (error) {
    if (error instanceof CheckConfigError) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }

  const primary = createClient(config.primaryUrl);
  const replica = createClient(config.replicaUrl);
  const novaRo = createClient(config.novaRoUrl);

  const problems = [];
  try {
    await primary.connect();
    await replica.connect();
    await novaRo.connect();

    const primaryStats = await collectStats(primary, 'primary');
    const replicaStats = await collectStats(replica, 'replica');
    problems.push(...compareStats(primaryStats, replicaStats));

    const subscription = await replica.query(
      `select pid, last_error,
              extract(epoch from (now() - last_msg_receipt_time)) as lag_seconds
         from pg_stat_subscription
        where subname = 'nova_sub'`,
    );
    const state = readSubscription(subscription.rows[0], config.lagMaxSeconds);
    problems.push(...state.problems);

    const readOnly = await assertReadOnly(novaRo);
    if (!readOnly.ok) {
      problems.push(readOnly.reason ?? 'проверка запрета записи не прошла');
    }

    const report = {
      subscription: { streaming: state.streaming, lag_seconds: state.lagSeconds, last_error: state.lastError },
      tables: TABLES.map(({ table }) => ({ table, primary: primaryStats[table], replica: replicaStats[table] })),
      read_only: readOnly,
      problems,
    };
    console.log(JSON.stringify(report, null, 2));

    if (problems.length > 0) {
      console.error(`check: ${problems.length} проблем(ы)`);
      process.exit(1);
    }
    console.log('check: ok');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'check: неизвестная ошибка');
    process.exit(1);
  } finally {
    await Promise.all([primary.end(), replica.end(), novaRo.end()]).catch(() => undefined);
  }
}

const invokedDirectly =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  void main();
}
