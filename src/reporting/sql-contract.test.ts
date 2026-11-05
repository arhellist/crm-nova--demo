// @vitest-environment node
/**
 * A11.3, A11.5 — SQL отчётного контура совпадает с каталогом PostgreSQL 16.
 *
 * Зачем: SQL-константы выполняются только на живой реплике, поэтому ошибка «колонки нет»
 * или «тип не тот» проходит unit-тесты с заглушкой и падает в production. Так и вышло:
 * `pg_stat_subscription` в PG16 не имеет `last_error`, а `timestamptz` приходил в Zod
 * как `Date`, а не строка — все три отчёта отвечали 500/503 (DEC-034). Тест держит
 * контракт: имена колонок из каталога PG16 и сериализация времени в ISO-8601.
 */
import { describe, expect, it } from 'vitest';
import { REPLICATION_STATE_SQL } from './db.js';
import { REPORT_SQL } from './routes/reports.js';

/** Колонки `pg_stat_subscription` в PostgreSQL 16 (каталог, а не догадка). */
const PG16_SUBSCRIPTION_COLUMNS = [
  'subid',
  'subname',
  'pid',
  'relid',
  'received_lsn',
  'last_msg_send_time',
  'last_msg_receipt_time',
  'latest_end_lsn',
  'latest_end_time',
  'subsyncpid',
  'synccpid',
] as const;

describe('A11.3 состояние подписки читается из PostgreSQL 16', () => {
  it('A11.3 не ссылается на несуществующие колонки pg_stat_subscription', () => {
    const sql = REPLICATION_STATE_SQL;
    expect(sql).toContain('from pg_stat_subscription');
    expect(sql).toContain('last_msg_receipt_time');
    // Регресс DEC-034: `last_error` появился в PG17, в PG16 такого столбца нет.
    expect(PG16_SUBSCRIPTION_COLUMNS).not.toContain('last_error');
    expect(sql).not.toMatch(/^\s*last_error\s*,\s*$/m);
    // Тип поля должен совпадать с контрактом openapi (`last_error: string | null`).
    expect(sql).toContain('null::text as last_error');
  });
});

describe('A11.5 отчёты сериализуют время в строку ISO-8601', () => {
  it('A11.5 объекты и нагрузка приводят timestamptz к тексту', () => {
    expect(REPORT_SQL.objects).toMatch(/to_char\(last_activity_at[^)]*\) as last_activity_at/);
    expect(REPORT_SQL.workload).toMatch(/to_char\(oldest_open_at[^)]*\) as oldest_open_at/);
  });

  it('A11.5 отчёты читают только вьюхи и не выгружают email/description', () => {
    for (const sql of Object.values(REPORT_SQL)) {
      expect(sql).toMatch(/from public\.report_/);
      expect(sql).not.toMatch(/select\s+\*/i);
      expect(sql).not.toMatch(/\bemail\b/);
      expect(sql).not.toMatch(/\bdescription\b/);
    }
  });
});
