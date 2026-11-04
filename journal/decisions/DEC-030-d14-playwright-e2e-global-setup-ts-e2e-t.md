# DEC-030 — D14: Playwright, e2e/global-setup.ts, e2e/tsconfig.json и правки package/tsco…

| Поле | Значение |
|------|----------|
| Дата | 2026-11-04 |
| Intake | — |
| Статус | принято |
| ADR | — |
| Заменяет | — |

**Контекст.** PRODUCES D14 перечисляет только e2e-файлы, release-скрипты и документацию.
Но `@playwright/test` — новая зависимость, `e2e/*.ts` вне `rootDir: src`, а ESLint с
`parserOptions.project` не разбирает файлы вне проектов. Без поддержки e2e либо не
проходит lint/typecheck, либо Playwright-тесты пытается собрать Vitest и валит `npm run test`.

**Решение.** D14: Playwright, e2e/global-setup.ts, e2e/tsconfig.json и правки package/tsconfig/.eslintrc добавлены в PRODUCES — без них e2e на TypeScript strict не проходит lint/typecheck; Vitest исключает e2e, чтобы Playwright-тесты не собирались его раннером

**Альтернативы.** Держать e2e вне TypeScript (`any`, JS) — запрещено ограничениями D14
и конституцией. Игнорировать e2e в ESLint через `.eslintignore` — тот же обход, только
скрытый, и e2e выпал бы из проверки типов. Отдельный пакет для e2e — новый workspace и
дублирование lock-файла. Принят отдельный strict-проект `e2e/tsconfig.json` и проверка
его в `npm run typecheck`; `vitest run --exclude "e2e/**"` разделяет раннеры.

**Чем подтверждено.** `npm run lint`, `npm run typecheck` (src + e2e), `npm run test`
(30 файлов / 102 теста), `npx playwright test --list` (17 сценариев A14.1);
`docs/readme.test.md` фиксирует чистый прогон 17 с.
