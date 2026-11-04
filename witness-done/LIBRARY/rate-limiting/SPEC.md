# LIBRARY MODULE: rate-limiting

## Назначение

Ограничение частоты запросов: по IP, по userId, по route-группе; Redis store + in-memory fallback; стандартные заголовки 429.

## Когда использовать

- Любой публичный HTTP API; особенно auth, upload, search, email, webhooks чужих клиентов.

## Когда не использовать

- Полностью private VPC admin-only без интернета — можно упростить, но auth endpoints всё равно лимитировать.
- Уже есть edge limit (Cloudflare/API Gateway) — согласовать слои, не множить разные UX без нужды.

## Зависимости

- Redis желателен для multi-instance (`REDIS_URL`).
- Встраивается во все HTTP модули; для Socket.IO — отдельный счётчик (см. `websocket-socketio`).

## Улучшения

- Порядок: whitelist → IP → user → route class; **самый строгий сработавший** побеждает (или документировать AND).
- Не использовать `KEYS` в hot path — Redis sliding window / `INCR`+TTL / token bucket.
- Fallback memory: per-process (документировать ослабление при multi-instance).
- `trust proxy` корректно настроен, иначе IP = proxy.
- Метрика `rate_limit_hit_total{tier,route}`.

---

## 1. Env

`RATE_LIMIT_ENABLED`, `RATE_LIMIT_WINDOW_MS` (60000), `REDIS_URL`, `RATE_LIMIT_TRUST_PROXY`, `RATE_LIMIT_WHITELIST_IPS`.

## 2. Tiers (defaults — править в ADAPTATION)

| Tier | Default |
|------|---------|
| `ip.default` | 100/min |
| `ip.auth` | 5/min |
| `ip.public` | 60/min |
| `user.api` | 1000/min |
| `user.heavy` | 100/min |
| `route.upload` | 10/min |
| `route.search` | 30/min |
| `route.email` | 5/min |

## 3. Key format

`rl:{tier}:{id}:{routeClass}:{windowBucket}`

## 4. Middleware contract

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.  
Body 429: `{ error: { code: 'RATE_LIMITED', message, retryAfterSec }, requestId }`.

## 5. Diagnostics

`GET /api/rate-limit/status` — текущие remaining для caller (auth optional; не светить чужие ключи).

## 6. Структура

```text
backend/src/middleware/rateLimit/
  store/{redis,memory}.ts
  policies.ts
  rateLimiter.ts
```

## 7. Тесты

- [ ] Exceed → 429 + headers
- [ ] Whitelist bypass
- [ ] Redis down → memory fallback (и log warn)
- [ ] Auth tier stricter than default

## 8. Антипаттерны

- Один глобальный лимит на всё без auth-protection
- Клиентский IP из `X-Forwarded-For` без trust proxy
- Redis `KEYS rl:*` на каждый request

## 9. Критерии готовности

Policies table + Redis/memory stores + middleware wired on auth/upload/search + metrics + tests.

## CONFLICTS with other modules

| С другим модулем | Проблема | Решение |
|------------------|----------|---------|
| `caching-redis` | Один Redis | Префикс `rl:` vs `cache:`; при падении Redis — memory fallback (документировать) |
| `auth-jwt` | Login brute-force | Tier `auth` на login/register/refresh |
| `admin-panel` | Высокий трафик list | Tier `admin` |
| `websocket-socketio` | HTTP middleware ≠ WS | Отдельный счётчик сообщений в socket handlers |
| `payments-stripe` | Webhook | Исключение/мягкий лимит для Stripe signature path |
| Trust proxy | Неверный IP | Настроить `trust proxy` согласованно с деплоем |
