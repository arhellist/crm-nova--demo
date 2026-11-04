# === DEV PROMPT: D05_objects_contract ===

РОЛЬ: backend

GATE: none

ЗАВИСИТ ОТ: D01, D02

## SIZE_BUDGET

| Поле | Значение |
|------|----------|
| surfaces | api |
| produces_count | 5 |
| entity | object |
| delivery_slice | S4 |
| split_group | objects |
| split_from | none |
| size_ok | yes |

## ЦЕЛЬ

Дать приложению единственный контракт записи объекта: валидация входа, создание, правка,
архивирование — всё через PostgREST и RPC, с ошибками, пригодными для показа пользователю.

## CONSUMES

- `OUTPUT/specs/data-model.md` — §3.2 `objects` (колонки, `archived_at`), §5 политики на объекты, §7 пагинация и сортировка
- `OUTPUT/specs/domain-rules.md` — правила объекта: непустое название, адрес, архивирование вместо удаления
- `OUTPUT/specs/contracts-checklist.md` — обязательные коды ошибок и запрет `select *`
- `OUTPUT/security/authn-authz.md` — SEC-05: управление объектами только `manager`
- `OUTPUT/docs/07_module_plan.md` — `crud-table` (adapt): keyset-пагинация, без `COUNT(*)`
- `OUTPUT/docs/07_conflicts.md` — `crud-table × auth-jwt`, `crud-table` offset/COUNT
- `OUTPUT/security/threat-model.md` — T11 (IDOR по объекту), T12 (массовое присвоение полей)

## CONTEXT_PACK

| Поле | Значение |
|------|----------|
| pack_id | P05 |
| pack_path | `OUTPUT/context/packs/P05.md` |
| retrieve_query | objects postgrest insert update archive validation keyset errors |
| max_chunks | 8 |
| validation_ok | yes |

## HOW

1. `src/features/objects/types.ts` — `ObjectRow` (`id`, `title`, `address`, `created_at`, `archived_at`)
   и `ObjectInput` без служебных полей. Источник правды — §3.2, поля не добавлять.
2. `src/features/objects/schema.ts` — zod: `title` 1..200 после `trim`, `address` 1..300;
   неизвестные ключи отбрасываются (`.strip()`), `id`/`created_at`/`archived_at` в вход не входят (T12).
3. `src/shared/api/postgrest.ts` — обёртка: базовый URL из `env.ts`, заголовок `Authorization`
   из текущей сессии, `Prefer: return=representation`, разбор ошибок PostgREST в
   `{ code, message, details? }`; SQL-текст и имя таблицы наружу не отдаются (INV-007).
4. `src/features/objects/api.ts` — `listObjects({ cursor, limit, includeArchived })`:
   `select=id,title,address,created_at,archived_at`, сортировка `title.asc,id.asc`,
   keyset-курсор `(title,id) > (…)`, `limit` ≤50 по умолчанию 20; `getObject(id)`;
   `createObject(input)`; `updateObject(id, input)`.
5. `src/features/objects/mutations.ts` — `archiveObject(id)` вызывает `POST /rest/v1/rpc/archive_object`
   и инвалидирует `['objects']`; повторный вызов возвращает тот же результат (идемпотентность D03).
6. Wire: мутации идут только через эти функции; компоненты не вызывают `supabase` напрямую.
   Ошибка 42501 → сообщение «Недостаточно прав», 0 строк при `update` → «Объект не найден или недоступен».

## INVARIANTS

1. Запись объекта возможна только через PostgREST/RPC; другого пути в коде нет (INV-001).
2. Создание, правка и архивирование объекта доступны только `manager`; исполнителю — только чтение (SEC-05).
3. `update` по чужому/несуществующему объекту возвращает 0 строк, а не 200 с пустым телом.
4. `archived_at` ставится только RPC; клиент не передаёт его в `insert`/`update`.
5. Список не использует `COUNT(*)` и `offset`; пагинация — keyset по `(title,id)`.
6. Ответы не содержат полей вне `ObjectRow`; `select *` в коде отсутствует.
7. Текст ошибки не раскрывает SQL, имена таблиц и факт существования чужой записи.
8. Архивный объект не исчезает из карточки задачи задним числом: `getObject` возвращает его с `archived_at`.
9. Значения названия и адреса сохраняются как текст, включая SQL-подобные строки.

## ACCEPTANCE

| ID | Given | When | Then |
|----|-------|------|------|
| A05.1 | `manager` | `createObject({title, address})` | Строка создана, возвращён `ObjectRow` без лишних полей |
| A05.2 | `manager` | `createObject({title: '   '})` | Ошибка валидации до сети, объект не создан |
| A05.3 | `executor` | `createObject(...)` | Ошибка 42501, в базе 0 новых строк |
| A05.4 | 25 объектов | `listObjects({limit: 20})` и затем по курсору | Первая страница 20, вторая продолжает без повторов и пропусков |
| A05.5 | `manager` | `createObject({title: "'; drop table tasks; --"})` | Строка сохранена как текст, `tasks` существует |
| A05.6 | `executor` | `updateObject(чужой_id, {title})` | 0 строк, название не изменено, сообщение без деталей БД |

## FIT_CHECKS

| Поле | Значение |
|------|----------|
| module | crud-table |
| conflicts_ref | `OUTPUT/docs/07_conflicts.md#1-конфликты-включённых-модулей` |
| conflicts_applied | `crud-table × auth-jwt`, `crud-table` offset/COUNT |
| app_contracts | GET /rest/v1/objects, POST /rest/v1/objects, PATCH /rest/v1/objects, POST /rest/v1/rpc/archive_object |
| runtime_trace_required | no |
| invariants_skip | пусто |
| depends_done | D01, D02 |
| eco_invariants | no-secrets |
| acceptance_ops | A05.1, A05.3 |
| pre_ci | required |
| pre_release | required |

## VERIFICATION_TAX

| Поле | Значение |
|------|----------|
| level | L2 |
| verify_cmd | `sp-verify --d D05 --gate pre_ci` |
| evidence | `OUTPUT/evidence/D05.json` |
| done_forbidden_unless | `tax_pass=true`, `ops_checked` содержит `POST /rest/v1/objects`, A05.1–A05.6 покрыты |
| review | `sp review D05 --verdict supports` от ревьюера ≠ автор |

## PRODUCES

- `src/features/objects/types.ts` — создать
- `src/features/objects/schema.ts` — создать
- `src/features/objects/api.ts` — создать
- `src/features/objects/mutations.ts` — создать
- `src/shared/api/postgrest.ts` — создать
- `src/features/auth/api.ts` — изменить (экспорт `supabaseUrl`/`supabaseAnonKey` для обёртки; DEC-013)

Тесты:

- `src/features/objects/schema.test.ts` — A05.2
- `src/features/objects/api.test.ts` — A05.1, A05.4, A05.5
- `src/features/objects/authz.test.ts` — A05.3, A05.6

## НЕ ТРОГАТЬ

- `src/features/objects/*.tsx` — экран в D06.
- `supabase/**` — схема и RPC в D02/D03.
- `src/features/tasks/**` — D07.

## PRE-CHECK

- [ ] D01, D02 `done`
- [ ] `P05.validation.json` → `ok: true`
- [ ] `size_ok: yes`
- [ ] В `data-model.md` §5 есть политики для `insert/update` объекта
- [ ] `archive_object` существует и вызывает `manager`-проверку

## ОГРАНИЧЕНИЯ

- Стек: TypeScript strict, `@supabase/supabase-js`, zod; без собственного HTTP-слоя.
- Типизация: `catalogs/typing-and-tests.md` — без `any`; ошибки PostgREST типизированы.
- Автотесты: vitest + mock PostgREST; кейсы = `A05.*`.
- Комментарии: `catalogs/code-comments.md`, на русском, у парсера ошибок и пагинации.
- VerificationTax: `done` после `pre_ci` + `acceptance_ids`.
- Context: только CONTEXT_PACK.
- NFR: p95 чтения списка ≤400 мс (NFR1), размер страницы ≤50.
- Доменные правила (≤12): название 1..200, адрес 1..300; архивный объект остаётся читаемым;
  исполнитель видит объект при наличии своей задачи (RLS, не фильтр клиента); удаление невозможно.
- Запрет: `select('*')`, передача `archived_at` из клиента, `COUNT(*)` для пагинации.

## ТРЕБУЕМЫЙ ФОРМАТ ВЫВОДА

- Модули в PRODUCES, рабочий код.
- Тесты с `A05.*`.
- Список файлов и пример ошибки API в чате.
- Обновить test-plan и progress.

## ЧЕКЛИСТ ПОСЛЕ ГЕНЕРАЦИИ

- [ ] Контракты совпадают с `data-model.md` §3.2
- [ ] Keyset-пагинация без повторов и пропусков
- [ ] Исполнитель не создаёт и не правит объекты
- [ ] Ошибки без SQL и деталей БД
- [ ] `proof_debt` пуст

## STOP

Остановиться после PRODUCES и `pre_ci`; D06 не начинать.
