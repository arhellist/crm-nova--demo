# LIBRARY MODULE: logging-pino

## Назначение

Структурированные JSON-логи (Pino): `requestId`, уровни, child-loggers с контекстом, клиентские ошибки (ограниченно), готовность к Loki/ELK.

## Когда использовать

- Почти всегда для backend (platform foundation).

## Когда не использовать

- CLI one-off scripts могут использовать упрощённый logger — но тот же формат полей желателен.

## Зависимости

- Сквозной модуль; интегрируется с HTTP, workers, socket.
- Не зависит от Redis.

## Улучшения

- Принимать входящий `X-Request-Id` только если валидный uuid/ulid; иначе генерировать свой (защита log injection).
- Redaction: `password`, `token`, `authorization`, `cookie`, card fields.
- `req.logger.child({ action })` — стандарт в controllers.
- Client error endpoint: rate limit + truncate stack + auth optional fingerprint.
- Pretty transport только `NODE_ENV=development`.

---

## 1. Env

`LOG_LEVEL`, `LOG_FORMAT` (`json`|`pretty`), `LOG_OUTPUT` (`stdout`|`file`|`both`), `LOG_FILE_PATH`, `LOG_REDACT_PATHS`.

## 2. Log shape

```json
{
  "level": 30,
  "time": "2026-06-02T10:23:45.123Z",
  "requestId": "…",
  "userId": "…",
  "msg": "User created",
  "method": "POST",
  "url": "/api/users",
  "statusCode": 201,
  "durationMs": 245
}
```

## 3. Middleware

- Assign `requestId`, echo header `X-Request-Id`
- Bind `req.logger`
- On `finish`/`close`: log completion with status + duration
- Errors: `logger.error({ err }, msg)` with stack in prod controlled by level

## 4. API (optional)

`POST /api/logs/client-error` — `{ message, stack?, url, userAgent }` rate-limited.

## 5. Структура

```text
backend/src/infra/logging/
  logger.ts
  middleware.ts
  redact.ts
```

## 6. Security

- No secrets in logs.
- PII minimization (email → hash optional in ADAPTATION).

## 7. Тесты

- [ ] Header propagation
- [ ] Redaction masks password
- [ ] Child bindings appear in output

## 8. Антипаттерны

- `console.log` в business code
- Логирование body login
- Разные форматы в workers vs HTTP

## 9. Критерии готовности

Pino root + HTTP middleware + redaction + documented field list + wired in app bootstrap.

## CONFLICTS with other modules

| С другим модулем | Проблема | Решение |
|------------------|----------|---------|
| Все feature-модули | Разный формат логов | Единый root logger + child; запрет console.log |
| `payments-stripe` / `auth-jwt` | Секреты в логах | Redact paths обязателен |
| `admin-panel` | Audit ≠ logs | Не заменять audit log логами |
| Client error endpoint | Flood | Rate limit + truncate |
