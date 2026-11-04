# === DEV PROMPT: D03_status_machine ===

РОЛЬ: DBA

GATE: none

ЗАВИСИТ ОТ: D01, D02

## SIZE_BUDGET

| Поле | Значение |
|------|----------|
| surfaces | db |
| produces_count | 4 |
| entity | task_status_history |
| delivery_slice | S2 |
| split_group | schema |
| split_from | none |
| size_ok | yes |

## ЦЕЛЬ

Сделать машину статусов в PostgreSQL: единственный RPC перехода, проверка матрицы и роли,
append-only история и архивирование — так, чтобы запрещённый переход отклонялся базой.

## CONSUMES

- `OUTPUT/specs/data-model.md` — §4.1 сигнатура `change_task_status`, §4.2 триггеры, §4.3 `archive_object`/`archive_task`, §4.4 помощники
- `OUTPUT/specs/domain-rules.md` — матрица 5×5 «откуда → куда», роль на переход, обязательный комментарий
- `OUTPUT/security/authn-authz.md` — SEC-04 (переход только своей задачи), SEC-07 (комментарий возврата)
- `OUTPUT/security/threat-model.md` — T05 (подделка истории), T09 (прямой UPDATE статуса)
- `OUTPUT/specs/contracts-checklist.md` — пункты про RPC и гранты
- `OUTPUT/docs/adr/0002-supabase-single-write-path.md` — запись только через RPC

## CONTEXT_PACK

| Поле | Значение |
|------|----------|
| pack_id | P03 |
| pack_path | `OUTPUT/context/packs/P03.md` |
| retrieve_query | change_task_status transitions guard trigger history append-only archive |
| max_chunks | 8 |
| validation_ok | yes |

## HOW

1. `0004_status_machine.sql`: `create function rpc.change_task_status(p_task_id uuid, p_target task_status, p_comment text default null) returns task_status` — `security definer`, `set search_path = public, pg_temp`, `volatile`. Внутри: `select … for update` задачи; если строки нет → `raise exception` с SQLSTATE `P0002`; вычислить `v_from := tasks.status`.
2. Проверка матрицы: `if (v_from, p_target) not in (…)` → `raise exception using errcode='P0001', message='transition_not_allowed'`. Матрица — литеральный `values`-список из `domain-rules.md`, не таблица в БД: изменение правил = миграция.
3. Проверка роли: `executor` двигает только свои задачи и только пары `new→in_progress`, `in_progress→on_review`, `rework→in_progress`; `manager` — только `on_review→accepted|rework`. Нарушение → `42501 insufficient_privilege`.
4. `on_review → rework` без непустого `p_comment` → `P0001 comment_required` (INV-домен, SEC-07).
5. `0005_history_triggers.sql`: `before update on tasks` — `guard_task_status`: разрешить `status` только если `current_setting('app.status_rpc', true) = 'on'`; иначе `raise`. RPC ставит `set local app.status_rpc = 'on'` перед `update` и сбрасывает после. `after update` — `log_task_status`: вставка в `task_status_history` (`task_id`, `from_status`, `to_status`, `actor_id := auth.uid()`, `comment`). `after insert on tasks` — строка создания (`from_status null`, `to_status 'new'`).
6. `0006_archive_rpc.sql`: `rpc.archive_object` и `rpc.archive_task` — только `manager`, `security definer`, проставляют `archived_at = now()`, идемпотентны (повторный вызов не меняет `archived_at`). `0007_grants.sql`: `revoke all on function … from public, anon`; `grant execute` нужным ролям; на `task_status_history` — только `select` для `authenticated`.
7. Wire: сначала функции, потом триггеры, потом гранты — иначе триггер сработает на seed и упадёт. Seed-переходы выполняются через RPC, а не прямым `update`.

## INVARIANTS

1. Статус меняется только через `rpc.change_task_status`; прямой `update tasks set status` отклоняется (INV-003).
2. История append-only: нет грантов на `insert/update/delete`, запись только триггером (INV-004).
3. Каждая успешная смена статуса оставляет ровно одну строку истории.
4. Неуспешная попытка не меняет ни `tasks.status`, ни историю — транзакция откатывается целиком.
5. `on_review → rework` без комментария отклоняется и через RPC, и при прямом вызове триггера.
6. Актор в истории — `auth.uid()` реального пользователя, а не переданный параметр.
7. Запрещённые пары (15 из 25) отклоняются с `P0001`, разрешённые (5) проходят для правильной роли.
8. `security definer`-функции недоступны `anon` и имеют фиксированный `search_path` (INV-008).
9. Архивирование идемпотентно: повторный вызов не меняет `archived_at` и не пишет историю.
10. `archive_*` не удаляет строки; FK `on delete restrict` сохраняется.

## ACCEPTANCE

| ID | Given | When | Then |
|----|-------|------|------|
| A03.1 | Задача `new`, исполнитель — её владелец | RPC `change_task_status(...,'in_progress')` | Статус `in_progress`, одна строка истории с актором |
| A03.2 | Задача `new`, менеджер | RPC `change_task_status(...,'accepted')` | Ошибка `P0001 transition_not_allowed`, статус и история не изменены |
| A03.3 | Задача `on_review`, менеджер | RPC с `p_target='accepted'` | Статус `accepted`, история пополнена |
| A03.4 | Чужая задача, исполнитель | RPC с `p_target='in_progress'` | `42501 insufficient_privilege`, 0 строк истории |
| A03.5 | Задача `on_review`, менеджер, `p_comment` пуст | RPC с `p_target='rework'` | `P0001 comment_required`, статус прежний |
| A03.6 | Задача `new` | `update tasks set status='accepted'` напрямую | Ошибка guard-триггера, статус не изменён |
| A03.7 | Любая роль, включая `authenticated` | `insert into task_status_history` | `permission denied`, строк нет |
| A03.8 | Задача уже архивирована | Повторный `rpc.archive_task` | Успех без изменения `archived_at`, история не растёт |

## FIT_CHECKS

| Поле | Значение |
|------|----------|
| module | none |
| conflicts_ref | none |
| conflicts_applied | none |
| app_contracts | POST /rest/v1/rpc/change_task_status, POST /rest/v1/rpc/archive_task, POST /rest/v1/rpc/archive_object |
| runtime_trace_required | no |
| invariants_skip | пусто |
| depends_done | D01, D02 |
| eco_invariants | no-secrets |
| acceptance_ops | A03.1, A03.2 |
| pre_ci | required |
| pre_release | required |

## VERIFICATION_TAX

| Поле | Значение |
|------|----------|
| level | L2 |
| verify_cmd | `sp-verify --d D03 --gate pre_ci` |
| evidence | `OUTPUT/evidence/D03.json` |
| done_forbidden_unless | `tax_pass=true`, `ops_checked` содержит оба RPC, A03.1–A03.8 покрыты |
| review | `sp review D03 --verdict supports` от ревьюера ≠ автор |

## PRODUCES

- `supabase/migrations/0004_status_machine.sql` — создать
- `supabase/migrations/0005_history_triggers.sql` — создать
- `supabase/migrations/0006_archive_rpc.sql` — создать
- `supabase/migrations/0007_grants.sql` — создать

Тесты:

- `supabase/tests/transitions_test.sql` — A03.1–A03.5
- `supabase/tests/history_test.sql` — A03.6, A03.7
- `supabase/tests/archive_test.sql` — A03.8

## НЕ ТРОГАТЬ

- `src/**` — панель статусов в D08.
- `supabase/migrations/0001–0003` — не переписывать, только добавлять.

## PRE-CHECK

- [ ] D02 `done`, `supabase db reset` зелёный
- [ ] `domain-rules.md` содержит все 25 пар с пометкой допустимости
- [ ] `P03.validation.json` → `ok: true`
- [ ] `size_ok: yes`
- [ ] Сигнатуры RPC совпадают с `data-model.md` §4.1 и §4.3

## ОГРАНИЧЕНИЯ

- Стек: PL/pgSQL, pgTAP; без внешних расширений.
- Типизация: явные типы параметров и `returns`, никаких `text` вместо enum.
- Автотесты: pgTAP на каждую пару матрицы (5 разрешённых + 15 запрещённых) и на append-only.
- Комментарии: `comment on function` на русском с описанием матрицы и роли.
- VerificationTax: `done` после `pre_ci` + `acceptance_ids`.
- Context: только CONTEXT_PACK.
- NFR: p95 мутации ≤600 мс (NFR2); транзакция не держит блокировку дольше 200 мс.
- Доменные правила (≤12): `new→in_progress` (исполнитель), `in_progress→on_review` (исполнитель),
  `on_review→accepted` (менеджер), `on_review→rework` (менеджер, комментарий обязателен),
  `rework→in_progress` (исполнитель); остальные 20 пар недопустимы; актор — из `auth.uid()`.
- Запрет: второй путь записи через `update` из клиента; триггер не должен пропускать `update`.

## ТРЕБУЕМЫЙ ФОРМАТ ВЫВОДА

- Миграции в PRODUCES, без псевдокода.
- pgTAP-кейсы с `A03.*`.
- Вывод `pg_prove` в чате.
- Обновить test-plan и progress.

## ЧЕКЛИСТ ПОСЛЕ ГЕНЕРАЦИИ

- [ ] 25 пар проверены: 5 проходят, 15 отклоняются, 5 недопустимы по роли/состоянию
- [ ] Прямой `update status` падает на guard-триггере
- [ ] История: ровно одна строка на переход, порядок сохраняется
- [ ] `anon` без `execute`, `search_path` зафиксирован
- [ ] `proof_debt` пуст

## STOP

Остановиться после PRODUCES и `pre_ci`; D04 не начинать.
