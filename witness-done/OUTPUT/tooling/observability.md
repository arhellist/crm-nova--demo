# Наблюдаемость и мониторинг

> Сгенерировано Witness Done v1.31.0. Соответствует NFR5, NFR7, NFR16, NFR17 и ADR-0006.

## 1. Метрики (Prometheus, `/metrics`)

| Метрика | Тип | Метки | Зачем |
|---------|-----|-------|-------|
| `http_requests_total` | counter | `route`, `status` | RPS, доля 5xx |
| `http_request_duration_seconds` | histogram | `route` | p50/p95/p99 |
| `replica_lag_seconds` | gauge | — | NFR7, алерт |
| `replica_streaming` | gauge | — | 0/1 состояние подписки |
| `replica_last_sync_timestamp` | gauge | — | застой подписки |
| `report_cache_hit_total` | counter | `report` | эффективность кэша |
| `report_cache_miss_total` | counter | `report` | — |
| `db_pool_total` / `db_pool_acquired` / `db_pool_waiting` | gauge | — | NFR12 |
| `auth_failures_total` | counter | `reason` | безопасность |
| `rate_limit_hit_total` | counter | `tier`, `route` | NFR13 |

`/metrics` доступен только из внутренней сети (не публикуется через Cloudflare).

## 2. Логи (pino)

- JSON, поля: `level`, `time`, `msg`, `request_id`, `route`, `status`, `duration_ms`, `user_id`.
- `request_id`: входящий `X-Request-Id` принимается только как UUID, иначе генерируется.
- Redact: `authorization`, `cookie`, `apikey`, `password`, `access_token`, `refresh_token`, `*token*`.
- Без тел запросов и значений полей. Уровень `info` в prod, `debug` локально.
- События безопасности: неуспешный вход, отказ RLS (`P0403`), запрещённый переход (`P0422`),
  смена роли администратором, превышение rate limit.

## 3. Ошибки (Sentry)

- Frontend и backend, `environment` = staging/production.
- `sendDefaultPii: false`; `beforeSend` удаляет заголовки, query с токенами, локальные переменные.
- В событии: `request_id`, код ошибки, маршрут, версия релиза. Без SQL и PII.

## 4. Дашборды

| Дашборд | Панели |
|---------|--------|
| Продукт | доступность, RPS, p95/p99, доля 5xx, входы |
| Репликация | лаг (график + порог 5 с и 30 с), `streaming`, объём WAL, диск |
| Backend | RPS, latency по маршрутам, пул соединений, кэш отчётов |
| Безопасность | неуспешные входы, отказы RLS, rate limit, 401/403 |

## 5. Алерты

| Условие | Порог | Канал | Реакция |
|---------|-------|-------|---------|
| Доступность `/health` | 2 фейла подряд из 3 регионов | Pager | runbook инцидента |
| Доля 5xx | > 0.5% за 5 мин | Pager | проверить логи по `request_id` |
| p95 latency | > 400 мс за 5 мин | Slack | профилирование, план запроса |
| Лаг репликации | > 30 с | Slack → Pager при 5 мин | runbook репликации |
| Подписка не `streaming` | 5 мин | Pager | пересоздание подписки |
| Диск реплики | > 80% | Slack | очистка WAL, ревизия слота |
| Серия неуспешных входов | 10 за 10 мин | Slack | блокировка, проверка источника |
| Отсутствие метрик | 5 мин | Pager | проверка контейнера и сети |

## 6. Runbooks

- `docs/runbooks/incident.md` — общий порядок инцидента.
- `docs/runbooks/replication.md` — лаг, разрыв подписки, пересоздание слота.
- `docs/runbooks/restore.md` — PITR и бэкап, учения.
- `docs/runbooks/release.md` — релиз и откат.
- `docs/runbooks/secrets-rotation.md` — ротация секретов.
- `docs/runbooks/provisioning.md` — выдача и блокировка доступов.
- `docs/runbooks/product-smoke.md` — полный smoke перед релизом.

## 7. SLO и отчётность

Ежемесячно: доступность, p95, доля 5xx, лаг репликации p95, число инцидентов и время
восстановления. Отчёт хранится вместе с журналом релизов; расхождение с NFR — повод для ревизии.
