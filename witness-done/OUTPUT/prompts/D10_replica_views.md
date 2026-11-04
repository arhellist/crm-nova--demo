# === DEV PROMPT: D10_replica_views ===

РОЛЬ: DBA

GATE: none

ЗАВИСИТ ОТ: D03

## SIZE_BUDGET

| Поле | Значение |
|------|----------|
| surfaces | db |
| produces_count | 5 |
| entity | — |
| delivery_slice | S7 |
| split_group | reports |
| split_from | none |
| size_ok | yes |

## ЦЕЛЬ

Поднять контур чтения: публикация `pgoutput` на primary, подписка во втором PostgreSQL 16,
роль `nova_ro` только на `select` и три отчётные вьюхи — чтобы отчёты не касались базы записи.

## CONSUMES

- `OUTPUT/specs/data-model.md` — §9 отчётные вьюхи (колонки и агрегаты)
- `OUTPUT/docs/adr/0003-logical-replication-readonly.md` — публикация/подписка, отсутствие failover
- `OUTPUT/security/secrets-and-config.md` — какие строки подключения допустимы, чего не должно быть в git
- `OUTPUT/security/data-protection.md` — запрет ПДн и комментариев в отчётных данных
- `OUTPUT/tooling/deploy.md` — порядок подъёма контуров
- `OUTPUT/docs/nfr.md` — NFR7 (лаг p95 ≤5 с), NFR8 (RPO/RTO), NFR10 (объём истории)
- `OUTPUT/tooling/observability.md` — метрики лага и размера WAL

## CONTEXT_PACK

| Поле | Значение |
|------|----------|
| pack_id | P10 |
| pack_path | `OUTPUT/context/packs/P10.md` |
| retrieve_query | publication subscription nova_ro views lag wal slot replica |
| max_chunks | 9 |
| validation_ok | yes |

## HOW

1. `supabase/migrations/0008_publication_and_ro.sql`: `create publication nova_pub for table profiles, objects, tasks, task_status_history`
   с `publish = 'insert,update,delete'`; `create role nova_ro login noinherit` без пароля в файле
   (пароль — переменная окружения контейнера); `grant usage on schema public to nova_ro`;
   `grant select on objects, tasks, profiles, task_status_history to nova_ro`; `revoke all on all
   tables in schema public from nova_ro` до выдачи (порядок важен).
2. `infra/replica/docker-compose.yml` — сервис `replica` (образ `postgres:16`), `wal_level = logical`
   не требуется на подписчике, `max_replication_slots = 4`, volume, healthcheck `pg_isready`;
   сервис `api` подключается только к `replica` по `DATABASE_URL_REPLICA`.
3. `infra/replica/init/010_subscription.sql` — `create subscription nova_sub connection '<primary>'
   publication nova_pub with (copy_data = true, create_slot = true)`; идемпотентность через
   `do $$ begin if not exists (select 1 from pg_subscription where subname='nova_sub') then …`.
4. `infra/replica/init/020_views.sql` — три вьюхи по §9: `report_objects` (объект, число задач по
   статусам, дата последнего изменения), `report_workload` (исполнитель, число активных задач),
   `report_status_ages` (статус, средний и максимальный возраст задачи). Вьюхи создаются от
   владельца-миграции, `nova_ro` получает только `select` на них.
5. `infra/replica/check.mjs` — скрипт: сверяет `count(*)` и `max(updated_at)` четырёх таблиц с primary,
   читает `pg_stat_subscription` (`streaming`, `lag_seconds`, `last_error`), проверяет, что
   `insert` от `nova_ro` падает с `25006`; exit 0 только если всё сошлось. Параметры — из env, не из argv.

## INVARIANTS

1. `nova_ro` имеет только `select`; любая запись падает с `25006` (INV-011).
2. Реплика не является путём записи и не участвует в обработке пользовательских мутаций (INV-001).
3. Публикация включает ровно четыре таблицы; новые таблицы добавляются миграцией, не вручную.
4. Пароль и строка подключения к primary не хранятся в git и не попадают в образ.
5. Вьюхи не содержат email, `description` и комментариев (защита ПДн).
6. `copy_data = true` только при первичной подписке; повторный запуск не дублирует данные.
7. Остановка реплики не влияет на primary: слот удерживает WAL, но запись продолжается.
8. `check.mjs` возвращает 1 при расхождении счётчиков и при не-streaming подписке.

## ACCEPTANCE

| ID | Given | When | Then |
|----|-------|------|------|
| A10.1 | Пустое окружение | `docker compose up -d` | `replica` healthy, `api` стартует, повторный запуск ничего не ломает |
| A10.2 | Реплика запущена | `check.mjs` | `pg_stat_subscription` = streaming, `lag_seconds` ≤5, exit 0 |
| A10.3 | 10 мутаций статуса на primary | `check.mjs` | `count(*)` и `max(updated_at)` четырёх таблиц совпадают с primary |
| A10.4 | Роль `nova_ro` | `insert into tasks …` на реплике | Ошибка `25006`, строка не создана |

## FIT_CHECKS

| Поле | Значение |
|------|----------|
| module | none |
| conflicts_ref | none |
| conflicts_applied | none |
| app_contracts | `GET /rest/v1/objects` (только чтение через `nova_ro`) |
| runtime_trace_required | no |
| invariants_skip | пусто |
| depends_done | D03 |
| eco_invariants | no-secrets |
| acceptance_ops | A10.2, A10.3 |
| pre_ci | required |
| pre_release | required |

## VERIFICATION_TAX

| Поле | Значение |
|------|----------|
| level | L1 |
| verify_cmd | `sp-verify --d D10 --gate pre_ci` |
| evidence | `OUTPUT/evidence/D10.json` |
| done_forbidden_unless | `tax_pass=true`, A10.1–A10.4 покрыты |
| review | `sp review D10 --verdict supports` (рекомендуется) |

## PRODUCES

- `supabase/migrations/0008_publication_and_ro.sql` — создать
- `infra/replica/docker-compose.yml` — создать
- `infra/replica/init/010_subscription.sql` — создать
- `infra/replica/init/020_views.sql` — создать
- `infra/replica/check.mjs` — создать

Тесты:

- `infra/replica/check.test.mjs` — A10.4 (проверка отказа записи)
- `infra/replica/compose.test.mjs` — A10.1
- `supabase/tests/views_test.sql` — A10.2, A10.3

## НЕ ТРОГАТЬ

- `supabase/migrations/0001–0007` — не переписывать.
- `src/**` — API отчётов в D11.

## PRE-CHECK

- [ ] D03 `done`
- [ ] `P10.validation.json` → `ok: true`
- [ ] `size_ok: yes`
- [ ] `wal_level = logical` на primary (локальный Supabase)
- [ ] Секреты подключения заданы через env, не в файлах

## ОГРАНИЧЕНИЯ

- Стек: PostgreSQL 16 (подписчик), Docker Compose, Node 20 для `check.mjs`.
- Типизация: `check.mjs` на TypeScript-совместимом стиле (JSDoc), без `any`.
- Автотесты: проверки скрипта и вьюх; кейсы `A10.*`.
- Комментарии: `comment on view` на русском с описанием агрегата.
- VerificationTax: `done` после `pre_ci` и `acceptance_ids`.
- Context: только CONTEXT_PACK.
- NFR: NFR7 (лаг p95 ≤5 с), NFR8 (RPO/RTO).
- Доменные правила (≤12): реплика только читается; вьюхи — агрегаты; ПДн и комментарии не выгружаются;
  лаг измеряется по `pg_stat_subscription`; слот не удаляется автоматически.
- Запрет: `service_role`, строка подключения к primary в backend/образе/git (INV-006).

## ТРЕБУЕМЫЙ ФОРМАТ ВЫВОДА

- Миграции и инфраструктура в PRODUCES.
- Скрипт `check.mjs` с exit-кодами.
- Список файлов и вывод `check.mjs` в чате.
- Обновить test-plan и progress.

## ЧЕКЛИСТ ПОСЛЕ ГЕНЕРАЦИИ

- [ ] `docker compose up -d` идемпотентен
- [ ] Подписка в состоянии streaming, лаг измеряется
- [ ] `nova_ro` не пишет
- [ ] Вьюхи без ПДн и комментариев
- [ ] `proof_debt` пуст

## STOP

Остановиться после PRODUCES и `pre_ci`; D11 не начинать.
