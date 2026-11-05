# === DEV PROMPT: D02_schema_rls ===

РОЛЬ: DBA

GATE: none

ЗАВИСИТ ОТ: D01

## SIZE_BUDGET

| Поле | Значение |
|------|----------|
| surfaces | db |
| produces_count | 5 |
| entity | profiles, objects, tasks, task_status_history |
| delivery_slice | S1 |
| split_group | schema |
| split_from | none |
| size_ok | yes |

## ЦЕЛЬ

Развернуть схему из четырёх таблиц с перечислениями, индексами, помощниками роли и RLS так,
чтобы изоляция исполнителя обеспечивалась базой, а не интерфейсом.

## CONSUMES

- `OUTPUT/specs/data-model.md` — §2 перечисления, §3.1–3.4 колонки и ограничения, §3.5 каскады, §5 RLS, §6 порядок миграций
- `OUTPUT/specs/erd.mermaid` — связи и кардинальности
- `OUTPUT/security/authn-authz.md` — матрица «роль × действие» (RBAC), SEC-01…SEC-12
- `OUTPUT/security/data-protection.md` — какие поля не покидают БД
- `OUTPUT/docs/adr/0002-supabase-single-write-path.md` — единственный путь записи
- `OUTPUT/docs/nfr.md` — NFR1 (p95 чтения ≤400 мс), NFR19 (миграции идемпотентны), NFR11 (нагрузка)
- `OUTPUT/docs/07_module_plan.md` — раздел «Gaps»: seed как отдельный артефакт

## CONTEXT_PACK

| Поле | Значение |
|------|----------|
| pack_id | P02 |
| pack_path | `OUTPUT/context/packs/P02.md` |
| retrieve_query | enums tables constraints rls policies current_role seed |
| max_chunks | 9 |
| validation_ok | yes |

## HOW

1. Миграция `0001_enums_and_tables.sql`: создать `user_role` (`manager`, `executor`) и
   `task_status` (`new`, `in_progress`, `on_review`, `accepted`, `rework`) ровно в порядке §2;
   таблицы `profiles`, `objects`, `tasks`, `task_status_history` по §3 с `timestamptz`,
   `check` на непустые `title`, `archived_at` вместо удаления.
2. Индексы из §3 и §7: `tasks(assignee_id, status) where archived_at is null`,
   `tasks(object_id, status)`, `task_status_history(task_id, created_at desc)`, уникальность
   `profiles.id` = `auth.users.id`.
3. Миграция `0002_helpers.sql`: `public.current_role()` — `security definer`, `stable`,
   `set search_path = public, pg_temp`, читает `profiles.role` по `auth.uid()` (INV-005, INV-008);
   `public.is_manager()` поверх неё. Гранты: `execute` только `authenticated`.
4. Миграция `0003_rls_policies.sql`: `alter table … enable row level security` на всех четырёх;
   `revoke all on … from anon`; политики `select`/`insert`/`update` по матрице §5. История — только
   `select` (INV-004). `delete` не выдаётся никому: удаление = `archived_at`.
5. `supabase/seed.sql`: 3 пользователя Auth с ролями (1 `manager`, 2 `executor`), 3 объекта,
   8 задач, покрывающих все пять статусов, и по строке истории на каждый переход. Seed
   идемпотентен: `on conflict do nothing` по детерминированным UUID.
6. Wire: миграции прогоняются `supabase db reset` до `seed.sql`; `current_role()` создаётся
   раньше политик, иначе политики не компилируются.

## INVARIANTS

1. RLS включён на всех четырёх таблицах; отсутствие политики означает отказ (INV-002).
2. `anon` не имеет `select/insert/update/delete` ни на одной таблице и не вызывает помощников.
3. Исполнитель читает только свои задачи и объекты, где у него есть хотя бы одна неархивированная задача.
4. Исполнитель не может изменить `assignee_id`, `status`, `archived_at` чужих строк — 0 строк.
5. `task_status_history` не имеет грантов на `insert/update/delete` ни у одной роли (INV-004).
6. Роль определяется `profiles.role`, а не claim `role` (INV-005).
7. Помощники — `security definer` с `set search_path = public, pg_temp` (INV-008).
8. Жёсткое удаление невозможно: FK `on delete restrict`, грантов `delete` нет.
9. Seed не содержит `service_role`: он выполняется миграционным доступом, не клиентским ключом.

## ACCEPTANCE

| ID | Given | When | Then |
|----|-------|------|------|
| A02.1 | `auth.uid()` исполнителя | `select current_role()` | Возвращает `executor` из `profiles`, не из JWT |
| A02.2 | Два исполнителя, у каждого своя задача | Исполнитель A читает `tasks` | Видит только свои строки, чужая задача — 0 строк |
| A02.3 | Исполнитель A | `update tasks set status='accepted'` по чужой задаче | 0 строк, статус не изменён |
| A02.4 | Seed применён | `select status, count(*) from tasks group by status` | Все пять статусов непусты, задач ≥8, объектов 3 |
| A02.5 | Роль `anon` | `select * from objects` и `select current_role()` | `permission denied` на оба запроса |
| A02.6 | Исполнитель A | `delete from tasks where id = <своя>` | `permission denied`, строка на месте |

## FIT_CHECKS

| Поле | Значение |
|------|----------|
| module | none |
| conflicts_ref | none |
| conflicts_applied | none |
| app_contracts | GET /rest/v1/objects, GET /rest/v1/tasks |
| runtime_trace_required | no |
| invariants_skip | пусто |
| depends_done | D01 |
| eco_invariants | no-secrets |
| acceptance_ops | A02.2, A02.4 |
| pre_ci | required |
| pre_release | required |

## VERIFICATION_TAX

| Поле | Значение |
|------|----------|
| level | L1 |
| verify_cmd | `sp-verify --d D02 --gate pre_ci` |
| evidence | `OUTPUT/evidence/D02.json` |
| done_forbidden_unless | `tax_pass=true`, `fit.acceptance_ids` покрывает A02.1–A02.6 |
| review | `sp review D02 --verdict supports` (L1 — рекомендуется, не блокирует) |

## PRODUCES

- `supabase/migrations/0001_enums_and_tables.sql` — создать
- `supabase/migrations/0002_helpers.sql` — создать
- `supabase/migrations/0003_rls_policies.sql` — создать
- `supabase/migrations/0010_objects_select_archived_manager.sql` — создать (DEC-035, DEC-038):
  политика `objects_select` отдаёт менеджеру и активные, и архивные объекты; без этого
  архивный объект не открывается по ID и не воспроизводится приёмка A06.5
- `supabase/seed.sql` — создать
- `supabase/config.toml` — изменить (схемы и порт локального стека)

Тесты:

- `supabase/tests/schema_test.sql` — A02.1, A02.4
- `supabase/tests/rls_test.sql` — A02.2, A02.3, A02.5, A02.6

## НЕ ТРОГАТЬ

- `src/**` — код приложений в D04+.
- `supabase/migrations/0004` и далее — машина статусов в D03.

## PRE-CHECK

- [ ] D01 `done`, `npm run lint|typecheck|test` зелёные
- [ ] `OUTPUT/specs/data-model.md` §2–§5 заполнены без TBD
- [ ] `P02.validation.json` → `ok: true`
- [ ] `size_ok: yes`
- [ ] Локальный Supabase поднимается (`supabase start`)

## ОГРАНИЧЕНИЯ

- Стек: PostgreSQL 15 (`supabase/postgres`), pgTAP для SQL-тестов.
- Типизация: SQL — явные типы в функциях, `returns table` с перечисленными колонками; `any` нет.
- Автотесты: pgTAP на каждую политику из матрицы; без тестов задание не закрывается.
- Комментарии: `comment on table/column` на русском для всех четырёх таблиц.
- VerificationTax: `catalogs/verification-tax.md`.
- Context: только CONTEXT_PACK.
- NFR: NFR1 — индексы под фильтры `assignee_id`, `status`, `object_id`; NFR19 — повторный прогон миграций.
- Доменные правила (≤12): архивирование вместо удаления; `archived_at` не мешает истории;
  исполнитель видит объект при наличии своей неархивированной задачи; комментарий не обязателен
  на уровне схемы — правило перехода проверяет D03; `created_at` задаёт БД.
- Запрет: политики, разрешающие `using (true)`, и любые обходы RLS (INV-002).

## ТРЕБУЕМЫЙ ФОРМАТ ВЫВОДА

- Миграции + seed в PRODUCES.
- pgTAP-тесты с ID `A02.*`.
- Список изменённых файлов и вывод `supabase db reset` в чате.
- Обновить test-plan и progress.

## ЧЕКЛИСТ ПОСЛЕ ГЕНЕРАЦИИ

- [ ] `supabase db reset` с нуля зелёный, seed идемпотентен при повторе
- [ ] `pg_prove` по `supabase/tests` зелёный
- [ ] Все четыре таблицы с RLS, `anon` без грантов
- [ ] A02.1–A02.6 объявлены тестами
- [ ] `proof_debt` пуст

## STOP

Остановиться после PRODUCES и `pre_ci`; D03 не начинать.
