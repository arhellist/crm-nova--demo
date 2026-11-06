/**
 * Проверка пайплайна стилей SPA (change ui-spacing-density).
 *
 * @acceptance Стили SPA собираются через PostCSS+Tailwind по design-notes
 *
 * Без PostCSS директивы `@tailwind` остаются в бандле литералами — UI «слипается».
 * Тест гоняет тот же PostCSS-конфиг, что Vite, и запрещает сырые директивы.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);

describe('Tailwind pipeline (ui-spacing-density)', () => {
  it('PostCSS конфиг подключает tailwindcss и autoprefixer', () => {
    const config = require(join(root, 'postcss.config.cjs')) as {
      plugins: Record<string, unknown>;
    };
    expect(config.plugins).toHaveProperty('tailwindcss');
    expect(config.plugins).toHaveProperty('autoprefixer');
  });

  it('обработка tokens.css даёт утилиты и убирает @tailwind', async () => {
    const input = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8');
    const postcssConfig = require(join(root, 'postcss.config.cjs')) as {
      plugins: Record<string, unknown>;
    };
    const plugins = Object.entries(postcssConfig.plugins).map(([name, opts]) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- тот же require, что у Vite
      const plugin = require(name) as (o?: unknown) => postcss.AcceptedPlugin;
      return plugin(opts);
    });

    const result = await postcss(plugins).process(input, {
      from: join(root, 'src/styles/tokens.css'),
    });

    expect(result.css).not.toMatch(/@tailwind\s+(base|components|utilities)/);
    expect(result.css).toMatch(/\.flex\b/);
    expect(result.css).toMatch(/\.gap-4\b|\.gap-1\b|\.gap-3\b/);
    expect(result.css).toMatch(/--bg-0:\s*#070a12/);
  });
});
