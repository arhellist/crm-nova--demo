# === DEV PROMPT: D01_platform_skeleton ===

РОЛЬ: platform

GATE: none

ЗАВИСИТ ОТ: нет (первое задание цепочки). Требуется только bootstrap шага 00.

## SIZE_BUDGET

| Поле | Значение |
|------|----------|
| surfaces | tooling, api |
| produces_count | 6 |
| entity | — (platform) |
| delivery_slice | S0 |
| split_group | platform |
| split_from | none |
| size_ok | yes |

## ЦЕЛЬ

Поднять каркас фронтенда и read-only backend: строгая конфигурация окружения, логгер с
редактированием секретов, health-эндпоинт и базовый rate limit — чтобы остальные задания
писали код в готовую обвязку.

## CONSUMES

- `OUTPUT/tooling/env-vars.md` — полный список переменных и правило «нет значения → падение на старте»
- `OUTPUT/tooling/tsconfig.strict-notes.md` — флаги `strict`, `noUncheckedIndexedAccess`, запрет `any`
- `OUTPUT/tooling/lint-setup.md` — `.eslintrc.js`, локальные правила, порядок запуска
- `OUTPUT/tooling/verify-commands.md` — `npm run lint|typecheck|test|build`
- `OUTPUT/specs/openapi.yaml` — операция `getHealth` (схема ответа)
- `OUTPUT/docs/nfr.md` — NFR5 (p95 `/health` ≤50 мс), NFR16 (лог не содержит токенов)
- `OUTPUT/docs/07_module_plan.md` — `logging-pino` (include), `rate-limiting` (include)
- `OUTPUT/tooling/ci.yml.example` — джобы `lint`, `typecheck`, `unit`

## CONTEXT_PACK

| Поле | Значение |
|------|----------|
| pack_id | P01 |
| pack_path | `OUTPUT/context/packs/P01.md` |
| retrieve_query | env validation pino redact health rate limit |
| max_chunks | 8 |
| validation_ok | yes |

## HOW

1. Создать `package.json` с раздельными скриптами `dev`, `build`, `lint`, `typecheck`, `test`;
   `engines.node` = `>=20`. Зависимости: `fastify`, `pino`, `zod`, `@supabase/supabase-js`.
2. `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `module: NodeNext`,
   `target: ES2022`. Отдельный `tsconfig.client.json` для фронтенда с `jsx: react-jsx`.
3. `src/shared/config/env.ts` — единственный источник правды о конфигурации: схема zod на
   переменные из `env-vars.md`, вызов `safeParse` на импорте, при ошибке печать списка
   отсутствующих ключей **без значений** и `process.exit(1)`. Экспорт — замороженный объект.
4. `src/shared/logger.ts` — pino с `redact` для `authorization`, `access_token`, `refresh_token`,
   `cookie`, `password`; в dev — `pino-pretty`, в production — JSON; рядом `requestId` из заголовка
   `x-request-id` или `crypto.randomUUID()`.
5. `src/server/app.ts` — сборка Fastify: `trustProxy`, регистрация rate limit (60 запросов/мин на
   IP, `429` с `retry-after`), маршрут `GET /health` по схеме `getHealth` (`status`, `version`,
   `commit`, `uptime_s`), обработчик ошибок, который логирует `requestId` и не отдаёт стек.
6. `src/server/index.ts` — старт после валидации env, `SIGTERM`/`SIGINT` → `app.close()` и выход 0;
   при ошибке старта — лог `fatal` и код 1. Wire: `logger` подключается до регистрации маршрутов,
   `requestId` — хук `onRequest`, чтобы все логи запроса имели идентификатор.

## INVARIANTS

1. Конфигурация читается только через `env.ts`; прямых `process.env.X` в остальном коде нет.
2. При отсутствии обязательной переменной процесс не стартует и не печатает её значение.
3. Логгер не пишет токены, cookie и пароли — проверяется unit-тестом на redact.
4. `GET /health` не требует авторизации и не обращается к БД.
5. Ответ `GET /health` содержит `version` из `package.json` и не содержит секретов.
6. `SIGTERM` завершает процесс не дольше 5 с и не оставляет открытых сокетов.
7. Ошибки наружу — только `{ error: { code, message } }` без стеков и SQL (INV-007).
8. `service_role` не читается в коде фронтенда и backend (INV-006).

## ACCEPTANCE

| ID | Given | When | Then |
|----|-------|------|------|
| A01.1 | Нет `SUPABASE_URL` в окружении | Импорт `env.ts` | Процесс падает с кодом 1, в stderr перечислен ключ, значения нет |
| A01.2 | Валидное окружение | `GET /health` | 200, тело по схеме `getHealth`, `version` совпадает с `package.json` |
| A01.3 | Запрос с `authorization: Bearer secret` | Логирование запроса | В выводе pino поля `authorization` нет, секрет не встречается |
| A01.4 | 61 запрос за минуту с одного IP | 61-й `GET /health` | 429 и заголовок `retry-after` |
| A01.5 | Сервер запущен | `SIGTERM` | Процесс завершается с кодом 0 не дольше 5 с |
| A01.6 | Запрос с `x-request-id: abc` | `GET /health` | В логах обеих строк запроса `request_id=abc` |

## FIT_CHECKS

| Поле | Значение |
|------|----------|
| module | logging-pino, rate-limiting |
| conflicts_ref | none |
| conflicts_applied | none |
| app_contracts | `GET /health` |
| runtime_trace_required | no |
| invariants_skip | пусто |
| depends_done | — |
| eco_invariants | logging, rate-limit, no-secrets |
| acceptance_ops | A01.2, A01.4 |
| pre_ci | required |
| pre_release | required |

## VERIFICATION_TAX

| Поле | Значение |
|------|----------|
| level | L2 |
| verify_cmd | `sp-verify --d D01 --gate pre_ci` |
| evidence | `OUTPUT/evidence/D01.json` |
| done_forbidden_unless | `tax_pass=true`, `fit.acceptance_ids` покрывает A01.1–A01.6 |
| review | `sp review D01 --verdict supports` от ревьюера ≠ автор |

## PRODUCES

- `package.json` — создать/изменить
- `tsconfig.json` — создать
- `src/shared/config/env.ts` — создать
- `src/shared/logger.ts` — создать
- `src/server/app.ts` — создать
- `src/server/index.ts` — создать

Тесты:

- `src/shared/config/env.test.ts` — A01.1
- `src/server/app.test.ts` — A01.2, A01.4, A01.6
- `src/shared/logger.test.ts` — A01.3
- `src/server/lifecycle.test.ts` — A01.5

## НЕ ТРОГАТЬ

- `src/features/**` — доменные фичи создают следующие задания.
- `supabase/**` — схема и миграции в D02.
- `.github/workflows/ci.yml` — уже создан на шаге 08; менять только по отдельному решению.

## PRE-CHECK

- [ ] `OUTPUT/tooling/env-vars.md` существует, список переменных полный
- [ ] `P01.validation.json` → `ok: true`
- [ ] `size_ok: yes`
- [ ] `.eslintrc.js` из шага 08 на месте, `npm run lint` на пустом каркасе зелёный
- [ ] Decision lock: версия Node выбрана (`>=20`), альтернатив не осталось

## ОГРАНИЧЕНИЯ

- Стек и библиотеки: Node 20, Fastify 4, pino, zod; фронтенд — React 18 + Vite (каркас без фич).
- Типизация: `catalogs/typing-and-tests.md` — только TS strict, `any` запрещён.
- Автотесты: на весь новый runtime-код в этом D; без тестов задание не закрывается.
- Комментарии: `catalogs/code-comments.md` — подробные, на русском, у модулей и публичных функций.
- VerificationTax: `catalogs/verification-tax.md` — `done` после `pre_ci` и `acceptance_ids`.
- Context: читать только CONTEXT_PACK (`catalogs/context-rag.md`).
- NFR: p95 `/health` ≤50 мс (NFR5); 100% запросов с `request_id` и без секретов (NFR16).
- Доменные правила: в этом задании нет домена; доменные проверки не добавлять.
- Запрет: backend не получает путь записи даже «для проверки» (INV-001).

## ТРЕБУЕМЫЙ ФОРМАТ ВЫВОДА

- Рабочий код в PRODUCES, без псевдокода.
- Тесты с ID `A01.*`.
- Краткий список изменённых файлов в чате.
- Обновить `OUTPUT/tests/test-plan-D01.md` и `OUTPUT/roadmaps/progress.md`.

## ЧЕКЛИСТ ПОСЛЕ ГЕНЕРАЦИИ

- [ ] `npm run lint`, `typecheck`, `test`, `build` зелёные
- [ ] CONTEXT_PACK прочитан, `validation_ok` подтверждён
- [ ] HOW выполнен по шагам, INVARIANTS не нарушены
- [ ] A01.1–A01.6 зелёные, каждый тест объявляет свой ID
- [ ] `proof_debt` пуст: тронуты только файлы PRODUCES
- [ ] `GET /health` проверен внешним контуром (A01.2, A01.4)

## STOP

Остановиться после PRODUCES и `pre_ci`. Следующее задание не начинать.
