# DEC-027 — D13 A13.1 требует на /metrics метрики http_request_duration_seconds, replica_…

| Поле | Значение |
|------|----------|
| Дата | 2026-11-04 |
| Intake | — |
| Статус | принято |
| ADR | — |
| Заменяет | — |

**Контекст.** A13.1 требует на `/metrics` серии `http_request_duration_seconds`,
`replica_lag_seconds`, `db_pool_waiting`, а `OUTPUT/tooling/observability.md` §1 — ещё
`http_requests_total`, `db_pool_total`/`acquired` и `replica_last_sync_timestamp`. D11 отдавал
только лаг, streaming и кэш. Правило с метрикой, которой нет в `/metrics`, нарушает инвариант 1
D13 и делает алерт вечно пустым.

**Решение.** D13 A13.1 требует на /metrics метрики http_request_duration_seconds, replica_lag_seconds и db_pool_waiting, а observability.md §1 требует http_requests_total, db_pool_total/acquired и replica_last_sync_timestamp. D11 отдавал только лаг, streaming и кэш. Дополняю контур метрик D11 (health.ts + server.ts: счётчики запросов, гистограмма, гейджи пула и времени синхронизации) и переснимаю акт D11; D13 остаётся только tooling/runbooks, src/** не расширяется beyond этого исправления.

**Альтернативы.** Добавить серии в D13 (файлы `src/reporting/**` не входят в PRODUCES D13 —
это proof_debt) или завести фиктивные метрики в правилах (нарушает инвариант 1). Принято
дополнить D11 и переснять его акт, потому что источник серий — существующий `/metrics` D11.

**Чем подтверждено.** `A13.1`/`A13.2` в `observability/rules.test.mjs`; повторный
`sp-verify --d D11 --gate pre_ci` с `tax_pass: true`; `src/reporting/routes/health.test.ts`
на новые серии.
