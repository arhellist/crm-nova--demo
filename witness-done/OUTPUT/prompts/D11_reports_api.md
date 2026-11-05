# === DEV PROMPT: D11_reports_api ===

РОЛЬ: backend

GATE: none

ЗАВИСИТ ОТ: D01, D10

## SIZE_BUDGET

| Поле | Значение |
|------|----------|
| surfaces | api |
| produces_count | 5 |
| entity | report |
| delivery_slice | S7 |
| split_group | reports |
| split_from | none |
| size_ok | yes |

## ЦЕЛЬ

Отдавать три отчёта и здоровье репликации с read-only backend: только чтение агрегатов от
`nova_ro`, явная метка источника и лага, деградация без падения остального продукта.

## CONSUMES

- `OUTPUT/specs/openapi.yaml` — операции `getObjectsReport`, `getWorkloadReport`, `getStatusAgesReport`, `getReplicationHealth`, `getMetrics`
- `OUTPUT/specs/data-model.md` — §9 состав вьюх `report_objects`, `report_workload`, `report_status_ages`
- `OUTPUT/docs/adr/0003-logical-replication-readonly.md` — backend не имеет пути записи
- `OUTPUT/security/data-protection.md` — запрет email, описаний и комментариев в ответах
- `OUTPUT/security/secrets-and-config.md` — `API_TOKEN`, `DATABASE_URL_REPLICA`, чего не должно быть в образе
- `OUTPUT/docs/nfr.md` — NFR4 (отчёт p95 ≤300 мс), NFR14 (таймауты), NFR13 (rate limit), NFR12 (пул)
- `OUTPUT/tooling/observability.md` — имена метрик и алертов
- `OUTPUT/tooling/verify-commands.md` — команды проверки backend

## CONTEXT_PACK

| Поле | Значение |
|------|----------|
| pack_id | P11 |
| pack_path | `OUTPUT/context/packs/P11.md` |
| retrieve_query | reports api token lag replica 503 metrics aggregates no pii |
| max_chunks | 9 |
| validation_ok | yes |

## HOW

1. `src/reporting/config.ts` — zod-схема: `API_TOKEN` (≥32 символа), `DATABASE_URL_REPLICA`,
   `REPORT_CACHE_TTL_S` (по умолчанию 30), `PORT`. `DATABASE_URL_PRIMARY*` в схеме отсутствует —
   процесс падает при попытке его прочитать (тест A11.7).
2. `src/reporting/db.ts` — пул `pg` (`max: 10`, `statement_timeout: 3000`, `query_timeout: 3000`)
   только к реплике; `query(sql)` с параметрами; отсутствие `pool.query` со строковой конкатенацией.
3. `src/reporting/routes/reports.ts` — `GET /api/reports/objects|workload|status-ages`:
   проверка `Authorization: Bearer <API_TOKEN>` до обращения к БД; CORS только для домена фронтенда,
   без `*` с credentials; кэш в процессе на `REPORT_CACHE_TTL_S`; ответ по схеме openapi:
   `data`, `source: "replica"`, `lag_seconds`, `generated_at`. Только `select` из вьюх.
4. `src/reporting/routes/health.ts` — `GET /health` (процесс жив, без БД), `GET /health/replication`
   (`status: streaming | lagging | down`, `lag_seconds`, `last_error`), `GET /metrics` (Prometheus).
5. `src/reporting/server.ts` — Fastify: `onRequest` проверка токена для `/api/*` и `/metrics`,
   `Origin` whitelist, `405` на `POST/PUT/PATCH/DELETE` для всех маршрутов, обработчик ошибок
   с кодом `REPLICA_UNAVAILABLE` → 503 и без строки подключения в тексте.
6. Wire: `/health` не зависит от реплики; `/health/replication` и отчёты — зависят. При падении
   реплики отчёты отдают 503 с `retry_after`, `/health` остаётся 200 — фронтенд показывает деградацию.

## INVARIANTS

1. Backend не имеет пути записи: только `SELECT` (INV-001, INV-011).
2. Все запросы идут к реплике; строки подключения к primary в процессе нет (INV-006).
3. Ответы содержат `email`, `description`, комментарии истории — запрещено (защита ПДн).
4. `/api/*` без валидного `API_TOKEN` → 401 до обращения к БД; чужой `Origin` → 403.
5. Мутирующие методы на любом маршруте → 405.
6. Каждый ответ отчёта содержит `source` и `lag_seconds`; при лаге >30 с статус `lagging`.
7. При недоступной реплике — 503 с кодом, без стека и строки подключения.
8. Пагинации и `COUNT(*)` в отчётах нет: агрегаты считает вьюха.
9. Кэш не отдаёт данные старше TTL и сбрасывается при деградации.
10. `/metrics` защищён тем же токеном и не раскрывает значения токенов (NFR16).

## ACCEPTANCE

| ID | Given | When | Then |
|----|-------|------|------|
| A11.1 | Реплика streaming | `GET /api/reports/objects` с токеном | 200, `source=replica`, `lag_seconds` ≤5, тело по openapi |
| A11.2 | Нет токена / чужой `Origin` / `POST` | Три запроса | 401, 403, 405 соответственно; БД не затронута |
| A11.3 | Лаг 40 с | `GET /health/replication` | `status=lagging`, `lag_seconds` ≥40, `last_error` null |
| A11.4 | 10 задач в трёх статусах | Сравнить `report_workload` с SQL на primary | Числа совпадают до последней мутации |
| A11.5 | Любой отчёт | Проверить ключи ответа | Нет `email`, `description`, `comment` |
| A11.6 | Реплика остановлена | `GET /api/reports/objects` и `GET /health` | 503 с `REPLICA_UNAVAILABLE`, `/health` = 200 |
| A11.7 | Процесс запущен | Прочитать окружение и `db.ts` | `DATABASE_URL_PRIMARY*` отсутствует, пул создан только на реплику |

## FIT_CHECKS

| Поле | Значение |
|------|----------|
| module | none |
| conflicts_ref | `OUTPUT/docs/07_conflicts.md#2-конфликты-с-архитектурными-решениями` |
| conflicts_applied | `caching-redis × NFR4` (кэш в процессе) |
| app_contracts | GET /api/reports/objects, GET /api/reports/workload, GET /api/reports/status-ages, GET /health/replication, GET /metrics |
| runtime_trace_required | no |
| invariants_skip | пусто |
| depends_done | D01, D10 |
| eco_invariants | logging, rate-limit, no-secrets |
| acceptance_ops | A11.1, A11.3, A11.6 |
| pre_ci | required |
| pre_release | required |

## VERIFICATION_TAX

| Поле | Значение |
|------|----------|
| level | L2 |
| verify_cmd | `sp-verify --d D11 --gate pre_ci` |
| evidence | `OUTPUT/evidence/D11.json` |
| done_forbidden_unless | `tax_pass=true`, `ops_checked` содержит все три отчёта, A11.1–A11.7 покрыты |
| review | `sp review D11 --verdict supports` от ревьюера ≠ автор |

## PRODUCES

- `src/reporting/config.ts` — создать
- `src/reporting/db.ts` — создать
- `src/reporting/routes/reports.ts` — создать
- `src/reporting/routes/health.ts` — создать
- `src/reporting/server.ts` — создать

Тесты:

- `src/reporting/config.test.ts` — A11.7
- `src/reporting/routes/reports.test.ts` — A11.1, A11.2, A11.5
- `src/reporting/routes/health.test.ts` — A11.3, A11.6
- `src/reporting/aggregates.test.ts` — A11.4
- `src/reporting/server.test.ts` — A11.6 (отчётный контур смонтирован в едином процессе, DEC-033)
- `src/reporting/sql-contract.test.ts` — A11.3, A11.5 (SQL совпадает с каталогом PG16, DEC-034)

## НЕ ТРОГАТЬ

- `src/server/**` — сервер записи не существует; это отдельный процесс.
- `infra/replica/**` — D10.
- `supabase/**` — primary.

## PRE-CHECK

- [ ] D10 `done`, вьюхи и `nova_ro` существуют
- [ ] `P11.validation.json` → `ok: true`
- [ ] `size_ok: yes`
- [ ] `openapi.yaml` содержит все пять операций
- [ ] `API_TOKEN` и `DATABASE_URL_REPLICA` заданы в env, не в коде

## ОГРАНИЧЕНИЯ

- Стек: Node 20, Fastify 4, `pg`, pino; без ORM.
- Типизация: `catalogs/typing-and-tests.md`, без `any`; строки БД валидируются схемой ответа.
- Автотесты: vitest + тестовая реплика в контейнере; кейсы `A11.*`.
- Комментарии: `catalogs/code-comments.md`, на русском, у проверки токена и CORS.
- VerificationTax: `done` после `pre_ci` и `acceptance_ids`.
- Context: только CONTEXT_PACK.
- NFR: NFR4, NFR12, NFR13, NFR14, NFR16.
- Доменные правила (≤12): отчёты только для `manager`; агрегаты без ПДн; источник — реплика;
  лаг честный; деградация не блокирует вход и задачи; 405 на запись; токен не логируется.
- Запрет: обращаться к primary, отдавать `select *` из таблиц вместо вьюх, кэшировать дольше 30 с.

## ТРЕБУЕМЫЙ ФОРМАТ ВЫВОДА

- Сервис в PRODUCES, рабочий код.
- Тесты `A11.*`.
- Список файлов и примеры ответов отчётов в чате.
- Обновить test-plan и progress; после `reports` — wave smoke.

## ЧЕКЛИСТ ПОСЛЕ ГЕНЕРАЦИИ

- [ ] Все три отчёта совпадают с SQL на primary
- [ ] 401/403/405 проверены
- [ ] Деградация: 503 на отчётах, 200 на `/health`
- [ ] В ответах нет ПДн и комментариев
- [ ] `proof_debt` пуст

## STOP

Остановиться после PRODUCES и `pre_ci`; D12 не начинать.
