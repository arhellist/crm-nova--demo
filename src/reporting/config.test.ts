/**
 * A11.7 — конфигурация отчётного процесса знает только контур чтения.
 *
 * Проверяется на трёх уровнях:
 *  - схема окружения не содержит ключей primary (`DATABASE_URL_PRIMARY*`),
 *    поэтому строка подключения к primary не может быть прочитана процессом;
 *  - `readReportingConfig` игнорирует лишние ключи и не печатает значения в ошибке;
 *  - `createReplicaPool` создаёт пул только с переданной строкой реплики (NFR12).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ReportingConfigError,
  readReportingConfig,
  REPLICA_LAG_ALERT_SECONDS,
} from './config.js';
import { createReplicaPool } from './db.js';

const TOKEN = 'reporting-token-0123456789abcdef';
const REPLICA_URL = 'postgresql://nova_ro:secret@127.0.0.1:5433/nova_replica';

function env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    API_TOKEN: TOKEN,
    DATABASE_URL_REPLICA: REPLICA_URL,
    ...extra,
  };
}

describe('A11.7 конфигурация только для реплики', () => {
  it('A11.7 DATABASE_URL_PRIMARY* отсутствует в схеме и в исходнике db.ts', () => {
    const source = readFileSync(new URL('./db.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/DATABASE_URL_PRIMARY/);

    const config = readReportingConfig(
      env({ DATABASE_URL_PRIMARY: REPLICA_URL, DATABASE_URL_PRIMARY_POOLER: REPLICA_URL }),
    );
    // Лишние ключи не попадают в конфигурацию: primary процессу неизвестен.
    expect(Object.keys(config)).not.toContain('DATABASE_URL_PRIMARY');
    expect(Object.keys(config)).not.toContain('DATABASE_URL_PRIMARY_POOLER');
    expect(config.DATABASE_URL_REPLICA).toBe(REPLICA_URL);
  });

  it('A11.7 пул создаётся только на реплику с лимитом NFR12', async () => {
    const pool = createReplicaPool(REPLICA_URL);
    try {
      expect(pool.options.connectionString).toBe(REPLICA_URL);
      expect(pool.options.max).toBe(10);
      expect(pool.options.statement_timeout).toBe(3_000);
      expect(pool.options.query_timeout).toBe(3_000);
    } finally {
      await pool.end();
    }
  });

  it('A11.7 TTL кэша по умолчанию 30 с и не превышает порог лага', () => {
    const config = readReportingConfig(env());
    expect(config.REPORT_CACHE_TTL_S).toBe(30);
    expect(config.REPORT_CACHE_TTL_S).toBeLessThanOrEqual(REPLICA_LAG_ALERT_SECONDS);
  });

  it('A11.7 ошибка конфигурации перечисляет ключи, но не значения', () => {
    expect(() => readReportingConfig({ API_TOKEN: 'short', DATABASE_URL_REPLICA: REPLICA_URL })).toThrowError(
      ReportingConfigError,
    );
    try {
      readReportingConfig({ API_TOKEN: 'short', DATABASE_URL_REPLICA: REPLICA_URL });
    } catch (error) {
      const message = String((error as Error).message);
      expect(message).toContain('API_TOKEN');
      // Значение токена и строка подключения не утекают в текст ошибки (INV-007).
      expect(message).not.toContain('short');
      expect(message).not.toContain('secret');
    }
  });
});
