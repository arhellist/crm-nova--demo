/**
 * Доступ к вторичной БД: пул только к реплике и чтение состояния подписки.
 *
 * Инварианты:
 *  - строка подключения берётся из `DATABASE_URL_REPLICA`; primary в этом процессе
 *    отсутствует, поэтому путь записи невозможен (INV-001, A11.7);
 *  - только `SELECT`: SQL-константы живут в модуле, значения передаются параметрами,
 *    конкатенации строк в запросах нет;
 *  - таймауты NFR14: запрос 3 с, соединение 3 с, пул 10 (NFR12);
 *  - строка подключения не попадает в тексты ошибок наружу (INV-007).
 */
import { Pool, type QueryResultRow } from 'pg';
import { REPLICA_LAG_ALERT_SECONDS } from './config.js';

/** Функция выполнения запроса: маршруты получают её через зависимости и легко подменяют в тестах. */
export type QueryRows = (sql: string, params?: readonly unknown[]) => Promise<unknown[]>;

/** Состояние подписки по openapi `ReplicationStatus`. */
export interface ReplicationState {
  status: 'streaming' | 'lagging' | 'broken';
  lag_seconds: number;
  last_error: string | null;
}

/** SQL состояния подписки: lag считается по времени получения последнего сообщения. */
export const REPLICATION_STATE_SQL = `select pid,
       last_error,
       extract(epoch from (now() - last_msg_receipt_time)) as lag_seconds
  from pg_stat_subscription
 where subname = 'nova_sub'`;

/** Строка `pg_stat_subscription`; `pid = null` — worker не запущен. */
export interface SubscriptionRow {
  pid: number | null;
  last_error: string | null;
  lag_seconds: string | number | null;
}

/**
 * Переводит строку подписки в статус отчётов.
 *
 * `broken` — worker не работает; `lagging` — работает, но данные старше порога NFR7;
 * `streaming` — лаг в пределах порога. Отсутствие строки тоже `broken`.
 */
export function toReplicationState(row: SubscriptionRow | undefined): ReplicationState {
  if (!row || row.pid === null) {
    return {
      status: 'broken',
      lag_seconds: 0,
      last_error: row?.last_error ?? 'подписка nova_sub не запущена',
    };
  }
  const lag = row.lag_seconds === null ? REPLICA_LAG_ALERT_SECONDS + 1 : Number(row.lag_seconds);
  const safeLag = Number.isFinite(lag) ? Math.max(lag, 0) : REPLICA_LAG_ALERT_SECONDS + 1;
  return {
    status: safeLag > REPLICA_LAG_ALERT_SECONDS ? 'lagging' : 'streaming',
    lag_seconds: Number(safeLag.toFixed(3)),
    last_error: row.last_error,
  };
}

/** Пул только к реплике; primary-переменные не читаются. */
export function createReplicaPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 3_000,
    statement_timeout: 3_000,
    query_timeout: 3_000,
    application_name: 'nova-reporting',
  });
}

/** Выполняет `SELECT` и возвращает строки; ошибки БД не раскрывают SQL наружу. */
export function createQueryRows(pool: Pool): QueryRows {
  return async (sql, params = []) => {
    const result = await pool.query<QueryResultRow>(sql, [...params]);
    return result.rows;
  };
}

/** Состояние подписки для /health/replication и проверки перед отчётами. */
export async function readReplicationState(query: QueryRows): Promise<ReplicationState> {
  const rows = await query(REPLICATION_STATE_SQL);
  return toReplicationState(rows[0] as SubscriptionRow | undefined);
}
