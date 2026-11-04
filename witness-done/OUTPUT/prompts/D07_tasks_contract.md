# === DEV PROMPT: D07_tasks_contract ===

РОЛЬ: backend

GATE: none

ЗАВИСИТ ОТ: D01, D02, D03

## SIZE_BUDGET

| Поле | Значение |
|------|----------|
| surfaces | api |
| produces_count | 5 |
| entity | task |
| delivery_slice | S5 |
| split_group | tasks |
| split_from | none |
| size_ok | yes |

## ЦЕЛЬ

Дать приложению контракт задачи: создание с назначением, правка полей, список по объекту и
исполнителю, смена статуса и архивирование — только через PostgREST и RPC D03.

## CONSUMES

- `OUTPUT/specs/data-model.md` — §3.3 `tasks`, §4.1 RPC, §7 пагинация, §8 аудит
- `OUTPUT/specs/domain-rules.md` — кто создаёт, кто меняет исполнителя и в каких статусах
- `OUTPUT/security/authn-authz.md` — SEC-04, SEC-06: исполнитель двигает только свои задачи
- `OUTPUT/security/threat-model.md` — T13 (переприсвоение), T14 (обход матрицы через UI)
- `OUTPUT/specs/contracts-checklist.md` — коды ошибок RPC и запрет `select *`
- `OUTPUT/docs/07_module_plan.md` — `crud-table` adapt (keyset), `auth-jwt` (роль из `profiles`)
- `OUTPUT/docs/nfr.md` — NFR1, NFR2

## CONTEXT_PACK

| Поле | Значение |
|------|----------|
| pack_id | P07 |
| pack_path | `OUTPUT/context/packs/P07.md` |
| retrieve_query | tasks assignee transitions create patch keyset archive errors |
| max_chunks | 8 |
| validation_ok | yes |

## HOW

1. `src/features/tasks/types.ts` — `TaskRow` (`id`, `object_id`, `title`, `description`, `status`,
   `assignee_id`, `author_id`, `created_at`, `updated_at`, `archived_at`) и `TaskInput`
   (`object_id`, `title`, `description?`, `assignee_id`). Поля — ровно §3.3.
2. `src/features/tasks/schema.ts` — zod: `title` 1..200, `description` ≤2000, `assignee_id` uuid,
   `object_id` uuid; `.strip()`; `status`/`author_id` в вход не входят (T14).
3. `src/features/tasks/api.ts` — `listTasksByObject(objectId, {cursor, limit})` и
   `listMyTasks({cursor, limit})` (фильтр `assignee_id = auth.uid()` не передаётся, его делает RLS);
   `getTask(id)`; `createTask(input)`; `updateTask(id, input)`. Сортировка `created_at.desc,id.desc`,
   `limit` ≤50.
4. `src/features/tasks/mutations.ts` — `changeTaskStatus(id, target, comment?)` вызывает
   `POST /rest/v1/rpc/change_task_status` и возвращает новый статус; `archiveTask(id)` —
   `rpc/archive_task`. Ошибки RPC маппятся: `P0001 transition_not_allowed` → «Этот переход недоступен»,
   `comment_required` → «Опишите, что доработать», `42501` → «Недостаточно прав».
5. `src/features/tasks/transitions.ts` — чистая функция `allowedTargets(status, role)` для отрисовки
   кнопок; таблица совпадает с `domain-rules.md` и **не является** защитой: сервер проверяет заново.
6. Wire: `createTask` не отправляет `status` — БД ставит `new`; смена исполнителя разрешена только
   в `new` и `rework`, проверка на клиенте повторяет серверную, но не заменяет её.

## INVARIANTS

1. Запись задачи — только PostgREST/RPC (INV-001).
2. Статус меняется только через RPC D03; прямой `PATCH status` отсутствует в коде (INV-003).
3. Исполнитель не может сменить `assignee_id` и не видит чужих задач (SEC-04).
4. `author_id` ставится БД из `auth.uid()`, клиент его не передаёт.
5. Список задач не использует `COUNT(*)` и `offset`.
6. Ошибки RPC переводятся в доменные сообщения, SQLSTATE не показывается пользователю.
7. Смена исполнителя возможна только в статусах `new` и `rework`.
8. Архивная задача остаётся читаемой и не меняет историю.
9. `allowedTargets` для `executor` не содержит менеджерских переходов.

## ACCEPTANCE

| ID | Given | When | Then |
|----|-------|------|------|
| A07.1 | `manager`, объект существует | `createTask` без статуса | Задача создана со статусом `new`, `author_id` = текущий пользователь |
| A07.2 | `executor` | `createTask` | 42501, в базе 0 новых задач |
| A07.3 | Задача `new`, исполнитель — владелец | `changeTaskStatus('in_progress')` | Статус изменён, возвращён `in_progress` |
| A07.4 | Задача `accepted` | `changeTaskStatus('rework')` | `transition_not_allowed`, статус прежний |
| A07.5 | Задача `in_progress` | `updateTask` со сменой `assignee_id` | Отказ по правилу домена, исполнитель прежний |
| A07.6 | 30 задач объекта | `listTasksByObject({limit: 20})` + курсор | Две страницы без дублей, порядок `created_at desc` |
| A07.7 | `executor` | `getTask(чужая_id)` | 0 строк, ошибка «Задача не найдена» без деталей |

## FIT_CHECKS

| Поле | Значение |
|------|----------|
| module | crud-table |
| conflicts_ref | `OUTPUT/docs/07_conflicts.md#1-конфликты-включённых-модулей` |
| conflicts_applied | `crud-table × auth-jwt`, `crud-table` offset/COUNT |
| app_contracts | GET /rest/v1/tasks, POST /rest/v1/tasks, PATCH /rest/v1/tasks, POST /rest/v1/rpc/change_task_status |
| runtime_trace_required | no |
| invariants_skip | пусто |
| depends_done | D01, D02, D03 |
| eco_invariants | no-secrets |
| acceptance_ops | A07.1, A07.3 |
| pre_ci | required |
| pre_release | required |

## VERIFICATION_TAX

| Поле | Значение |
|------|----------|
| level | L2 |
| verify_cmd | `sp-verify --d D07 --gate pre_ci` |
| evidence | `OUTPUT/evidence/D07.json` |
| done_forbidden_unless | `tax_pass=true`, `ops_checked` содержит `POST /rest/v1/rpc/change_task_status`, A07.1–A07.7 покрыты |
| review | `sp review D07 --verdict supports` от ревьюера ≠ автор |

## PRODUCES

- `src/features/tasks/types.ts` — создать
- `src/features/tasks/schema.ts` — создать
- `src/features/tasks/api.ts` — создать
- `src/features/tasks/mutations.ts` — создать
- `src/features/tasks/transitions.ts` — создать
- `src/shared/api/postgrest.ts` — изменить (проброс `serverMessage` для маппинга RPC; DEC-018)

Тесты:

- `src/features/tasks/schema.test.ts` — A07.5 (часть про вход)
- `src/features/tasks/api.test.ts` — A07.1, A07.2, A07.6, A07.7
- `src/features/tasks/mutations.test.ts` — A07.3, A07.4, A07.5

## НЕ ТРОГАТЬ

- `src/features/tasks/*.tsx` — экраны D08/D09.
- `supabase/**` — функции и триггеры D03.
- `src/features/objects/**` — контракт D05.

## PRE-CHECK

- [ ] D03 `done`, RPC `change_task_status` и `archive_task` существуют
- [ ] `P07.validation.json` → `ok: true`
- [ ] `size_ok: yes`
- [ ] `domain-rules.md` фиксирует правило смены исполнителя

## ОГРАНИЧЕНИЯ

- Стек: TypeScript strict, `@supabase/supabase-js`, zod.
- Типизация: `catalogs/typing-and-tests.md`, без `any`.
- Автотесты: vitest + mock PostgREST, кейсы `A07.*`.
- Комментарии: `catalogs/code-comments.md`, на русском, у маппинга ошибок RPC.
- VerificationTax: `done` после `pre_ci` + `acceptance_ids`.
- Context: только CONTEXT_PACK.
- NFR: NFR1 (p95 ≤400 мс), NFR2 (мутация ≤600 мс), страница ≤50.
- Доменные правила (≤12): создаёт только `manager`; исполнитель — из `profiles`, активный;
  смена исполнителя только `new`/`rework`; `description` необязателен; архив не удаляет;
  исполнитель видит задачу только свою; комментарий обязателен только на возврате.
- Запрет: передавать `status` в `insert`, вычислять права только в `transitions.ts`.

## ТРЕБУЕМЫЙ ФОРМАТ ВЫВОДА

- Модули в PRODUCES.
- Тесты `A07.*`.
- Список файлов и таблицу маппинга ошибок в чате.
- Обновить test-plan и progress.

## ЧЕКЛИСТ ПОСЛЕ ГЕНЕРАЦИИ

- [ ] Контракт совпадает с `data-model.md` §3.3/§4.1
- [ ] Статус не передаётся при создании
- [ ] Ошибки RPC переведены в доменные сообщения
- [ ] Исполнитель не читает и не правит чужие задачи
- [ ] `proof_debt` пуст

## STOP

Остановиться после PRODUCES и `pre_ci`; D08 не начинать.
