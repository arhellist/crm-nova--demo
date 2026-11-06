# Design: ui-spacing-density

## Цель

Вернуть читаемые отступы, поля и кнопки на всех экранах, включив реальную генерацию Tailwind
в production-сборке SPA без отклонения от `design-notes.md`.

## Модель данных

Без изменений.

## Эндпоинты и контракты API

Без изменений.

## UI / фронтенд

| Файл | Изменение |
|------|-----------|
| `postcss.config.cjs` | создать: `tailwindcss` + `autoprefixer` |
| `src/main.tsx` | импорт `@fontsource/inter` и `@fontsource/jetbrains-mono` (локально) |
| `src/styles/tokens.css` | без смены значений токенов; директивы `@tailwind` остаются |
| `package.json` | при необходимости зависимости `@fontsource/*` |
| `scripts/release/check-ui-css.test.mjs` (или рядом) | автотест: собранный CSS без `@tailwind`, с утилитами |

После пайплайна существующие классы (`gap-4`, `px-6`, `py-2`, `rounded-sm`, `space-y-4`) начнут
действовать — отдельный редизайн экранов не требуется, если визуально соответствует design-notes.

## Зависимости файлов

`vite.config.ts` уже собирает в `dist/web`; Vite автоматически подхватывает `postcss.config.*`.

## Обратная совместимость

`compatible`: HTML/маршруты/тесты селекторов по role/name не зависят от отсутствия утилит.
