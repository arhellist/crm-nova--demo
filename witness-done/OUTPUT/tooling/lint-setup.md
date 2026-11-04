# Линтеры, типы и тесты

> Сгенерировано Witness Done v1.31.0. Канон: `catalogs/typing-and-tests.md`, `catalogs/code-comments.md`.

## 1. Стек проверок

| Область | Инструмент | Конфиг | Команда |
|---------|-----------|--------|---------|
| Frontend + backend (TS) | ESLint 8 + `@typescript-eslint` + локальный плагин | `.eslintrc.js`, `eslint-plugin-local-rules/` | `npm run lint` |
| Типы | TypeScript 5.5 `strict` | `tsconfig.json`, `web/tsconfig.json`, `backend/tsconfig.json` | `npm run typecheck` |
| Unit | Vitest 1.6 | `vitest.config.ts` | `npm run test` |
| SQL/RLS | pgTAP | `supabase/tests/*.sql` | `supabase test db` |
| Backend integration | Vitest + `pg` к тестовой реплике | `backend/tests/*.test.ts` | `npm run test:backend` |
| E2E | Playwright 1.45 | `playwright.config.ts`, `e2e/` | `npm run test:e2e` |
| Форматирование | Prettier 3 | `.prettierrc` | `npm run format:check` |

## 2. Обязательные правила (не отключать)

- `@typescript-eslint/no-explicit-any: error`; `@ts-ignore` и `@ts-nocheck` запрещены,
  `@ts-expect-error` — только с описанием причины.
- App-код только `.ts`/`.tsx`; `.js` в `web/src` и `backend/src` валит линт.
- `no-console: error` (разрешены только `warn`/`error` в служебных скриптах).
- `eval`, `new Function`, `dangerouslySetInnerHTML` запрещены (CSP, INV-010).
- JSON с границы разбирается только через Zod (`local-rules/no-json-parse-without-zod`).
- `localStorage` — только с try/catch (`local-rules/no-storage-without-trycatch`).
- `useEffect`-зависимости и очистка таймеров (`no-unclean-timeout`).

## 3. TypeScript strict

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "moduleResolution": "bundler",
    "target": "ES2022"
  }
}
```

Отдельные конфиги: `web` — `jsx: react-jsx`, `lib: DOM`; `backend` — `lib: ES2022`, без DOM.
Типы БД генерируются `supabase gen types typescript --local > web/src/shared/api/db.types.ts`
и не правятся руками.

## 4. Тесты: что обязательно

| Что | Тип | Минимум |
|-----|-----|---------|
| Компоненты форм и статусов | unit (Vitest + Testing Library) | happy + ошибка + disabled |
| Хуки данных (`useObjects`, `useMyTasks`) | unit с MSW | загрузка, пусто, ошибка, успех |
| Маппинг ошибок `P040x` | unit | по одному кейсу на код |
| RLS и переходы | pgTAP | по кейсу на каждую политику и пару статусов |
| API отчётов | integration | 200, 400, 401, 403, 405, 429, 503 |
| Сквозные сценарии | Playwright | 8 сценариев NFR21 |

Фраза приёмки объявляется в тесте (`@acceptance Axx.k` или ID в имени). Тест без фразы и тест
со `skip` не проходят `--gate acceptance`.

## 5. Порядок в CI

`lint → typecheck → test → db-test → backend → security → e2e`. Джобы `test`, `db-test`,
`backend`, `e2e` не имеют `continue-on-error`: зелёный результат обязателен для merge.
