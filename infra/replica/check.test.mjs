/**
 * Тесты check.mjs: конфигурация без значений, сверка снимков, состояние подписки
 * и запрет записи для nova_ro.
 *
 * @acceptance A10.4
 */
import { describe, expect, it } from 'vitest';
import {
  CheckConfigError,
  assertReadOnly,
  compareStats,
  isReadOnlyViolation,
  readConfig,
  readSubscription,
} from './check.mjs';

const connection = 'postgres://user:secret@example.invalid:5432/db';

function configEnv(extra = {}) {
  return {
    PRIMARY_DATABASE_URL: connection,
    REPLICA_DATABASE_URL: connection,
    NOVA_RO_URL: connection,
    ...extra,
  };
}

describe('readConfig', () => {
  it('A10.4 конфигурация читается только из env и не печатает значения', () => {
    const config = readConfig(configEnv({ LAG_MAX_SECONDS: '7' }));
    expect(config.lagMaxSeconds).toBe(7);
    expect(config.primaryUrl).toBe(connection);

    expect(() => readConfig({})).toThrowError(CheckConfigError);
    try {
      readConfig({ PRIMARY_DATABASE_URL: connection });
    } catch (error) {
      expect(error).toBeInstanceOf(CheckConfigError);
      // В тексте только имена ключей, ни одного значения.
      expect(String(error.message)).not.toContain('secret');
      expect(String(error.message)).toContain('REPLICA_DATABASE_URL');
    }
  });
});

describe('assertReadOnly', () => {
  function clientThrowing(error) {
    return {
      query: async () => {
        throw error;
      },
    };
  }

  it('A10.4 insert от nova_ro отклонён read-only транзакцией 25006 — проверка зелёная', async () => {
    const result = await assertReadOnly(clientThrowing({ code: '25006' }));
    expect(result.ok).toBe(true);
    expect(result.code).toBe('25006');
    expect(isReadOnlyViolation({ code: '25006' })).toBe(true);
  });

  it('A10.4 отказ с другим кодом или успешный insert — проверка красная', async () => {
    const denied = await assertReadOnly(clientThrowing({ code: '42501' }));
    expect(denied.ok).toBe(false);
    expect(denied.reason).toContain('42501');

    const wrote = await assertReadOnly({ query: async () => ({ rows: [] }) });
    expect(wrote.ok).toBe(false);
    expect(isReadOnlyViolation({ code: '42501' })).toBe(false);
  });
});

describe('compareStats', () => {
  const snapshot = (rows, lastChange) => ({ rows, last_change: lastChange });

  it('A10.3 совпадающие снимки четырёх таблиц не дают расхождений', () => {
    const primary = {
      profiles: snapshot('3', '2026-11-04 10:00:00+00'),
      objects: snapshot('5', '2026-11-04 11:00:00+00'),
      tasks: snapshot('7', '2026-11-04 12:00:00+00'),
      task_status_history: snapshot('9', '2026-11-04 13:00:00+00'),
    };
    const replica = {
      profiles: snapshot('3', '2026-11-04 10:00:00+00'),
      objects: snapshot('5', '2026-11-04 11:00:00+00'),
      tasks: snapshot('7', '2026-11-04 12:00:00+00'),
      task_status_history: snapshot('9', '2026-11-04 13:00:00+00'),
    };
    expect(compareStats(primary, replica)).toEqual([]);
  });

  it('A10.3 расхождение строк и меток времени перечисляется по таблицам', () => {
    const primary = {
      profiles: snapshot('3', null),
      objects: snapshot('5', '2026-11-04 11:00:00+00'),
      tasks: snapshot('7', '2026-11-04 12:00:00+00'),
      task_status_history: snapshot('9', '2026-11-04 13:00:00+00'),
    };
    const replica = {
      profiles: snapshot('2', null),
      objects: snapshot('5', '2026-11-04 10:59:00+00'),
      tasks: snapshot('7', '2026-11-04 12:00:00+00'),
      task_status_history: snapshot('9', '2026-11-04 13:00:00+00'),
    };
    const problems = compareStats(primary, replica);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('profiles');
    expect(problems[1]).toContain('objects');
  });
});

describe('readSubscription', () => {
  it('A10.2 streaming и лаг в пределах порога — проблем нет', () => {
    const state = readSubscription({ pid: 42, last_error: null, lag_seconds: '2.4' }, 5);
    expect(state.streaming).toBe(true);
    expect(state.lagSeconds).toBeCloseTo(2.4);
    expect(state.problems).toEqual([]);
  });

  it('A10.2 большой лаг или остановленная подписка — проблемы', () => {
    const lagging = readSubscription({ pid: 42, last_error: null, lag_seconds: 40 }, 5);
    expect(lagging.problems.join(' ')).toContain('больше порога');

    const down = readSubscription({ pid: null, last_error: 'connection lost', lag_seconds: null }, 5);
    expect(down.streaming).toBe(false);
    expect(down.problems.length).toBeGreaterThanOrEqual(2);

    expect(readSubscription(undefined, 5).problems[0]).toContain('не найдена');
  });
});
