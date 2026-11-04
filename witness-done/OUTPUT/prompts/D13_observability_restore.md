# === DEV PROMPT: D13_observability_restore ===

РОЛЬ: platform

GATE: none

ЗАВИСИТ ОТ: D01, D11

## SIZE_BUDGET

| Поле | Значение |
|------|----------|
| surfaces | tooling |
| produces_count | 5 |
| entity | — |
| delivery_slice | S9 |
| split_group | release |
| split_from | none |
| size_ok | yes |

## ЦЕЛЬ

Сделать эксплуатацию проверяемой: метрики с нужными сериями, алерты по доступности и лагу,
регламент бэкапа и recovery-drill, runbook инцидента — с записанным учением восстановления.

## CONSUMES

- `OUTPUT/tooling/observability.md` — имена метрик, пороги и алерты
- `OUTPUT/tooling/deploy.md` — окружения и порядок выката
- `OUTPUT/tooling/env-vars.md` — переменные мониторинга, Sentry, uptime
- `OUTPUT/docs/nfr.md` — NFR6 (99.9%), NFR7 (лаг), NFR8 (RPO/RTO), NFR9 (откат), NFR17 (5xx)
- `OUTPUT/security/secrets-and-config.md` — DSN и ключи только в secret store
- `OUTPUT/docs/runbooks/product-smoke.md` — формат runbook и критерии успеха
- `OUTPUT/specs/openapi.yaml` — `getMetrics`, `getReplicationHealth`

## CONTEXT_PACK

| Поле | Значение |
|------|----------|
| pack_id | P13 |
| pack_path | `OUTPUT/context/packs/P13.md` |
| retrieve_query | metrics alerts availability lag backup pitr restore drill runbook |
| max_chunks | 9 |
| validation_ok | yes |

## HOW

1. `observability/prometheus/rules.yml` — группы: доступность (`up == 0` 1 мин), 5xx (`rate > 0.5%`),
   лаг репликации (`>30 с` 2 мин), ошибки API отчётов (`5xx` 5 мин), насыщение пула (`db_pool_waiting > 5`).
   Каждое правило — с `severity` и коротким `summary` на русском.
2. `observability/grafana/dashboard.json` — панели: доступность, p95 по маршрутам, 5xx, лаг,
   длительность переходов, размер WAL; источник — Prometheus, datasource по имени, не по ID.
3. `docs/runbooks/incident.md` — шаги: подтвердить алерт, определить контур (запись/чтение),
   временные меры (деградация отчётов, откат релиза), коммуникация, закрытие инцидента; в каждом
   шаге команда и ожидаемый результат, без «проверьте сами».
4. `docs/runbooks/backup-restore.md` — бэкап ежедневно + PITR, процедура восстановления на staging,
   проверка целостности (счётчики четырёх таблиц), фиксация RTO/RPO и подпись ответственного.
5. `scripts/ops/backup-check.sh` — проверяет наличие бэкапа за последние 24 ч, WAL-архив за час,
   возвращает 0/1 и печатает возраст последней точки; параметры — из env.
6. Wire: алерты ссылаются на runbook по имени файла и разделу; дашборд — на те же метрики,
   что отдаёт D11 (`/metrics`) и D01 (`request_id`); правило лага использует `replica_lag_seconds` D11.

## INVARIANTS

1. Каждая метрика в правилах существует в `/metrics`; правил без источника нет.
2. Алерт по доступности срабатывает не позже 2 минут и содержит имя runbook.
3. Секреты не попадают в `rules.yml`, `dashboard.json` и runbook.
4. Бэкап-проверка возвращает 1 при отсутствии точки за 24 ч.
5. Восстановление проверено на staging, акт с RTO/RPO приложен.
6. Лаг репликации и деградация отчётов — отдельные алерты, чтобы не смешивать причины.
7. Runbook инцидента выполняется человеком без автора изменений.
8. Порог 5xx ≤0.5% совпадает с NFR17.

## ACCEPTANCE

| ID | Given | When | Then |
|----|-------|------|------|
| A13.1 | Запущенный API | `GET /metrics` | Есть `http_request_duration_seconds`, `replica_lag_seconds`, `db_pool_waiting` |
| A13.2 | Правила загружены | `promtool check rules` и тест с `up=0` | Правило валидно, алерт firing с ссылкой на runbook |
| A13.3 | Учебное восстановление | Восстановить staging из PITR-точки | Данные совпали по счётчикам, RTO/RPO записаны в runbook |
| A13.4 | Инцидент-симуляция: реплика остановлена | Пройти runbook | Отчёты деградировали, запись работает, инцидент закрыт с таймстампами |

## FIT_CHECKS

| Поле | Значение |
|------|----------|
| module | none |
| conflicts_ref | none |
| conflicts_applied | none |
| app_contracts | GET /metrics, GET /health/replication |
| runtime_trace_required | no |
| invariants_skip | пусто |
| depends_done | D01, D11 |
| eco_invariants | logging, no-secrets |
| acceptance_ops | A13.1, A13.3 |
| pre_ci | required |
| pre_release | required |

## VERIFICATION_TAX

| Поле | Значение |
|------|----------|
| level | L1 |
| verify_cmd | `sp-verify --d D13 --gate pre_ci` |
| evidence | `OUTPUT/evidence/D13.json` |
| done_forbidden_unless | `tax_pass=true`, A13.1–A13.4 покрыты |
| review | `sp review D13 --verdict supports` (рекомендуется) |

## PRODUCES

- `observability/prometheus/rules.yml` — создать
- `observability/grafana/dashboard.json` — создать
- `docs/runbooks/incident.md` — создать
- `docs/runbooks/backup-restore.md` — создать
- `scripts/ops/backup-check.sh` — создать

Тесты:

- `scripts/ops/backup-check.test.sh` — A13.3
- `observability/rules.test.mjs` — A13.1, A13.2
- `docs/runbooks/incident.drill.md` — A13.4 (протокол учения)

## НЕ ТРОГАТЬ

- `src/**` — метрики эмитятся существующим кодом D01/D11.
- `infra/replica/**` — контур реплики D10.

## PRE-CHECK

- [ ] D01, D11 `done`, `/metrics` отвечает
- [ ] `P13.validation.json` → `ok: true`
- [ ] `size_ok: yes`
- [ ] Есть staging-проект Supabase и доступ к PITR
- [ ] Secret store доступен, ключи не в репозитории

## ОГРАНИЧЕНИЯ

- Стек: Prometheus/Grafana Cloud, Sentry, uptime-монитор; shell-скрипт — POSIX sh.
- Типизация: YAML/JSON валидируются схемами Prometheus и Grafana.
- Автотесты: `promtool` и `shellcheck` в CI; кейсы `A13.*`.
- Комментарии: runbook на русском, шаги в повелительном наклонении, с ожидаемым результатом.
- VerificationTax: `done` после `pre_ci` и `acceptance_ids`.
- Context: только CONTEXT_PACK.
- NFR: NFR6, NFR7, NFR8, NFR9, NFR17.
- Доменные правила (≤12): деградация отчётов не останавливает запись; алерт ≠ инцидент;
  бэкап без проверки восстановления не считается; runbook обновляется после каждого инцидента.
- Запрет: алерты без владельца и runbook; секреты в конфигурации мониторинга.

## ТРЕБУЕМЫЙ ФОРМАТ ВЫВОДА

- Конфигурация и runbooks в PRODUCES.
- Протокол учения и вывод `promtool`/`shellcheck` в чате.
- Список файлов, обновить test-plan и progress.

## ЧЕКЛИСТ ПОСЛЕ ГЕНЕРАЦИИ

- [ ] Все метрики из правил существуют
- [ ] Алерт проверен симуляцией
- [ ] Восстановление выполнено и записано
- [ ] Секретов в конфигурации нет
- [ ] `proof_debt` пуст

## STOP

Остановиться после PRODUCES и `pre_ci`; D14 не начинать.
