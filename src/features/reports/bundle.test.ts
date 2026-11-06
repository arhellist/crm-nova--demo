/**
 * A12.6 — в клиентском дереве нет контура записи и секретов.
 *
 * Экран отчётов ходит только на публичный адрес отчётов (`VITE_REPORT_API_URL`).
 * `service_role`, строка primary и `DATABASE_URL*` не должны появляться ни в одном
 * клиентском модуле, который попадает в production-бандл; тесты исключены из скана,
 * потому что в них запрещённые имена встречаются как строки проверки.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../', import.meta.url));

/** Клиентские каталоги, которые Vite включает в бандл (без backend-модулей). */
const CLIENT_DIRS = ['features/reports', 'features/auth', 'app', 'shared', 'styles'].map((rel) =>
  path.join(SRC, rel),
);

const FORBIDDEN = [
  /service_role/i,
  /SUPABASE_SERVICE_ROLE_KEY/,
  /DATABASE_URL_PRIMARY/,
  /PRIMARY_URL/,
  /postgres(ql)?:\/\//i,
];

/** Убирает комментарии: в бандл они не попадают, а в исходниках объясняют запреты. */
function stripComments(source: string): string {
  let out = '';
  let index = 0;
  let quote: string | null = null;
  while (index < source.length) {
    const char = source[index] ?? '';
    if (quote !== null) {
      out += char;
      if (char === '\\') {
        out += source[index + 1] ?? '';
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      out += char;
      index += 1;
      continue;
    }
    if (char === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && source[index + 1] === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        index += 1;
      }
      index += 2;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    if (statSync(abs).isDirectory()) {
      out.push(...walk(abs));
      continue;
    }
    if (!/\.(ts|tsx|css)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    // Backend-only env schema (DEC-060): не входит в SPA-бандл Vite.
    if (abs.endsWith(`${path.sep}shared${path.sep}config${path.sep}env.ts`)) continue;
    out.push(abs);
  }
  return out;
}

describe('A12.6 клиентский бандл', () => {
  it('A12.6 в клиентских модулях нет service_role, primary и строк подключения', () => {
    const files = CLIENT_DIRS.flatMap((dir) => walk(dir));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const text = stripComments(readFileSync(file, 'utf8'));
      for (const pattern of FORBIDDEN) {
        expect(text, `${path.relative(SRC, file)} содержит ${String(pattern)}`).not.toMatch(pattern);
      }
    }
  });

  it('A12.6 адрес отчётов задаётся только публичной VITE-переменной', () => {
    const apiSource = readFileSync(path.join(SRC, 'features/reports/api.ts'), 'utf8');
    const apiCode = stripComments(apiSource);
    expect(apiSource).toContain('VITE_REPORT_API_URL');
    expect(apiSource).toContain('VITE_REPORT_API_TOKEN');
    // Токен уходит заголовком, а не в URL, и не кладётся в хранилище браузера.
    expect(apiSource).toContain('authorization');
    expect(apiCode).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    // Клиент не умеет писать в backend отчётов: только GET.
    expect(apiCode).toMatch(/method: 'GET'/);
    expect(apiCode).not.toMatch(/method: '(POST|PUT|PATCH|DELETE)'/);
  });

  it('A12.6 в клиентских модулях нет записи отчётов в хранилище браузера', () => {
    const dir = path.join(SRC, 'features/reports');
    for (const file of walk(dir)) {
      const text = stripComments(readFileSync(file, 'utf8'));
      expect(text, `${path.basename(file)} пишет в localStorage`).not.toMatch(
        /localStorage|sessionStorage/,
      );
    }
  });
});
