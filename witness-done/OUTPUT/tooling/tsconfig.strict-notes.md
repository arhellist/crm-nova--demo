# TypeScript: строгий режим и границы типов

> Сгенерировано Witness Done v1.31.0. Канон: `catalogs/typing-and-tests.md`.

## 1. Компилятор

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ES2022",
    "skipLibCheck": false
  }
}
```

`web/tsconfig.json` добавляет `jsx: react-jsx`, `lib: ["DOM", "DOM.Iterable", "ES2022"]`.
`backend/tsconfig.json` — `lib: ["ES2022"]`, без DOM (запрет случайного `window`/`localStorage`).

## 2. Границы типов

| Граница | Правило |
|---------|---------|
| Ответ Supabase/PostgREST | тип из сгенерированного `db.types.ts` + Zod-схема перед использованием |
| Ответ RPC | явный тип статуса + Zod на `error.code` |
| Ответ отчётного API | Zod-схема из `specs/openapi.yaml` (`ReportEnvelope`, строки отчётов) |
| Формы | `react-hook-form` + `zodResolver`; тип выводится из схемы |
| Env | Zod-схема, валидация при старте; типизированный `config` |
| Ошибки БД | дискриминированный union по `code` (`P0400 | P0403 | P0422 | unknown`) |

## 3. Запреты

- `any` и `as unknown as T` без письменной причины (линт `error`).
- `@ts-ignore`, `@ts-nocheck`; `@ts-expect-error` — только с описанием.
- `!` (non-null assertion) на данных из сети.
- Приведение `string` к enum-статусу без валидации по словарю.
- Ручное редактирование сгенерированных типов БД.

## 4. Генерация типов

```bash
supabase gen types typescript --local > web/src/shared/api/db.types.ts
```

Файл коммитится и пересоздаётся после каждой миграции; расхождение ловится CI-проверкой
`npm run guard:db-types` (перегенерировать и сравнить с коммитом).

## 5. Типы и тесты

- Тесты пишутся на TS, без `any` в фикстурах.
- MSW-хендлеры типизированы теми же Zod-схемами, что и приложение: тест не может «согласиться»
  с неверным контрактом.
- Для pgTAP типы не применимы; вместо них — проверка `information_schema` и явные касты в SQL.
