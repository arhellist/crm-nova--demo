/**
 * A01.1 — отсутствие обязательной переменной окружения роняет процесс без раскрытия значений.
 *
 * Проверяем поведение отдельного процесса: модуль `env.ts` валидирует окружение на импорте,
 * поэтому тест не может просто импортировать его в общем процессе vitest (иначе тот умрёт).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));

/** Базовое валидное окружение; в каждом сценарии портим ровно одно поле. */
const baseEnv = {
  NODE_ENV: 'test',
  SUPABASE_URL: 'https://example.supabase.co',
  API_TOKEN: 'test-token-value-1234567890',
  DATABASE_URL: 'postgresql://nova_ro:secret-password@127.0.0.1:5433/nova_replica',
  ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
  GIT_COMMIT: 'testsha',
  LOG_LEVEL: 'silent',
};

function runEnvModule(env: NodeJS.ProcessEnv): { status: number | null; stderr: string; stdout: string } {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--eval', "await import('./src/shared/config/env.ts')"],
    { cwd: projectRoot, env, encoding: 'utf8', timeout: 30_000 },
  );
  return { status: result.status, stderr: result.stderr ?? '', stdout: result.stdout ?? '' };
}

describe('A01.1 конфигурация окружения', () => {
  it('A01.1 падает с кодом 1 и печатает ключ SUPABASE_URL без значений', () => {
    const env: NodeJS.ProcessEnv = { ...baseEnv, PATH: process.env.PATH };
    delete env.SUPABASE_URL;

    const run = runEnvModule(env);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('SUPABASE_URL');
    // Значения остальных переменных в сообщении не появляются (INV-007).
    expect(run.stderr).not.toContain(baseEnv.API_TOKEN);
    expect(run.stderr).not.toContain('secret-password');
  });

  it('A01.1 не печатает значение невалидной переменной', () => {
    const env: NodeJS.ProcessEnv = { ...baseEnv, PATH: process.env.PATH, PORT: 'not-a-port' };

    const run = runEnvModule(env);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('PORT');
    expect(run.stderr).not.toContain('not-a-port');
  });

  it('A01.1 валидное окружение загружается и замораживается', async () => {
    Object.assign(process.env, baseEnv);
    const { parseEnv } = await import('./env.js');

    const parsed = parseEnv({ ...baseEnv });

    expect(Object.isFrozen(parsed)).toBe(true);
    expect(parsed.PORT).toBe(8080);
    expect(parsed.ALLOWED_ORIGINS).toEqual(['http://127.0.0.1:5173']);
  });
});
