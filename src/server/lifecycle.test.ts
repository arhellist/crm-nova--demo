/**
 * A01.5 — штатное завершение процесса по SIGTERM.
 *
 * Поднимаем настоящий процесс (`node --import tsx src/server/index.ts`), ждём `GET /health`,
 * отправляем SIGTERM и проверяем код выхода и время. Порт выделяется из диапазона, чтобы тест
 * не конфликтовал с локальным запуском.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const SHUTDOWN_LIMIT_MS = 5_000;

let child: ChildProcess | undefined;

function serverEnv(port: number): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    LOG_LEVEL: 'silent',
    SUPABASE_URL: 'https://example.supabase.co',
    API_TOKEN: 'test-token-value-1234567890',
    DATABASE_URL: 'postgresql://nova_ro:secret@127.0.0.1:5433/nova_replica',
    ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
    GIT_COMMIT: 'testsha',
  };
}

async function waitForHealth(port: number, attempts = 100): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // сервер ещё поднимается — ждём следующий интервал
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('сервер не поднялся за отведённое время');
}

describe('A01.5 жизненный цикл', () => {
  afterEach(() => {
    if (child && child.exitCode === null && !child.killed) child.kill('SIGKILL');
    child = undefined;
  });

  it('A01.5 SIGTERM завершает процесс с кодом 0 не дольше 5 секунд', async () => {
    const port = 18_000 + Math.floor(Math.random() * 1_000);
    child = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts'], {
      cwd: projectRoot,
      env: serverEnv(port),
      stdio: 'ignore',
    });

    await waitForHealth(port);
    const startedShutdown = Date.now();

    const exitCode = await new Promise<number | null>((resolve) => {
      child?.once('exit', (code) => resolve(code));
      child?.kill('SIGTERM');
    });

    const elapsed = Date.now() - startedShutdown;
    expect(exitCode).toBe(0);
    expect(elapsed).toBeLessThan(SHUTDOWN_LIMIT_MS);
  }, 30_000);
});
