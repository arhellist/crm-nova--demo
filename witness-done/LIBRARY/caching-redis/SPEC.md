# LIBRARY MODULE: caching-redis

## Назначение

Кеш-слой на Redis: Cache-Aside (основной), опционально Write-Through; TTL, ключи, инвалидация по префиксу, сжатие крупных значений.

## Когда использовать

- Горячие read endpoints, сессии/лимиты уже на Redis, дорогие агрегаты dashboard.

## Когда не использовать

- Нет Redis и нет нагрузки — не вводить «на будущее» (YAGNI); можно отложить.
- Write-Behind в v1 без outbox — высокий риск потери данных; только с явной очередью и ADR.

## Зависимости

- `REDIS_URL`; часто совместно с `rate-limiting`, socket adapter, BullMQ.
- `logging-pino` на cache miss/error.

## Улучшения

- **Запрет `KEYS`** в runtime — SCAN или Redis Sets индексов вторичных ключей; для invalidate list — versioned keys (`users:list:v{n}`) проще, чем pattern delete.
- Stampede: singleflight / lock short TTL на miss.
- Serialize: JSON; compress (gzip/lz4) if `> CACHE_COMPRESS_THRESHOLD`.
- `CACHE_ENABLED=false` transparent passthrough.
- Не кешировать персональные данные без TTL и authz-aware key (`user:{id}:…`).

---

## 1. Env

`REDIS_URL`, `CACHE_ENABLED`, `CACHE_TTL_DEFAULT` (300), `CACHE_COMPRESS_THRESHOLD` (1024).

## 2. Key conventions

| Pattern | Example |
|---------|---------|
| entity | `user:{id}` |
| list | `users:list:{queryHash}:v{ver}` |
| agg | `metrics:users:daily:{date}` |

## 3. Service API

`get/set/del`, `getOrSet(key, ttl, loader)`, `invalidateEntity(type, id)`, bump list version.

Strategies in v1: **Cache-Aside + explicit invalidate on write**. Write-Through/Behind — LATER unless ТЗ требует.

## 4. Структура

```text
backend/src/services/cache/
  cache.service.ts
  cache-keys.ts
  cache-middleware.ts   # optional HTTP GET cache
```

Decorators `@Cacheable` — optional, не обязательны в JS/TS без единой DI.

## 5. Тесты

- [ ] getOrSet loads once under parallel (stampede guard if implemented)
- [ ] invalidate after update
- [ ] passthrough when disabled

## 6. Антипаттерны

- Бесконечный TTL на user PII
- Кеш без version/invalidate → stale security (banned user still «active»)
- Pattern KEYS on every write

## 7. Критерии готовности

CacheService + key helpers + wired on ≥1 hot read + invalidate on write + flag to disable + tests.

## CONFLICTS with other modules

| С другим модулем | Проблема | Решение |
|------------------|----------|---------|
| `rate-limiting` / `websocket-socketio` / BullMQ | Один Redis | Префиксы + при необходимости separate logical DB index |
| `auth-jwt` | Кеш user «active» | Инвалидация при ban/logout-all |
| `crud-table` / `admin-panel` | Stale lists | Versioned list keys |
| Write-Behind | Потеря данных | Не включать в v1 без outbox ADR |
