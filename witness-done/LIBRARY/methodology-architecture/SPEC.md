# LIBRARY MODULE: methodology-architecture

> **Тип: REFERENCE (опорный).** Не «фича для установки», а канон, на который опираются шаги 02–07 фабрики и все FEATURE-модули.  
> Подключать принципы **выборочно**: только то, что приемлемо для текущего ТЗ и масштаба (YAGNI).

## Назначение

Единые методологии: Clean/Feature architecture, нормализация БД, API design, FE state, паттерны, OWASP baseline, тестирование, observability, CI, coding standards.

## Когда использовать

- Всегда как справочник при constitution, architecture, data-model, roadmap.
- При генерации новых LIBRARY-модулей через `meta-prompt-generator`.

## Когда не использовать как чеклист «всё внедрить»

- Не требовать шардинг/Jaeger/BCNF-аудит для маленького CRUD MVP.
- Не навязывать Redux, если в ТЗ Zustand; не навязывать React, если выбран Vue.
- Не навязывать Node, если в ТЗ Go/Java (см. `catalogs/stack-policy.md`).
- Денормализация/реплики/Kafka/ClickHouse — только после NFR evidence.

---

## 0. Политика стека

См. `catalogs/stack-policy.md`: стек — решение команды, любой язык и фреймворк допустим; запретов
языка в каноне нет. Выбор обосновывается ADR; frontend, стили и infra — по ТЗ и нагрузке.

## 1. Принципы

SOLID, DRY, KISS, YAGNI, Separation of Concerns.

### Слои (логические)

Presentation → Application/Use-cases → Domain → Infrastructure.

### Папки: Feature-based

```text
src/features/{auth,chat,users}/
src/shared/{ui,lib,api,store}/
src/app/{routes,providers}/
```

Backend аналогично: `modules/{auth,orders}/` + `shared/`.

## 2. База данных (кратко-канон)

- Цель v1: **3NF**; денормализация только с ADR и метрикой.
- Связи 1:1 / 1:N / N:M (junction).
- Индексы: FK всегда; WHERE/ORDER частые; GIN для FTS; composite — порядок = фильтр→sort.
- Транзакции на multi-write; soft delete partial index `WHERE deleted_at IS NULL`.
- Cursor pagination для больших списков; offset — для малых.
- Expand/contract миграции.

*(Развёрнутые примеры 1NF–3NF, BCNF, шардинг, read replicas — применять по NFR, не копировать в каждый проект целиком.)*

## 3. API

- REST nouns; ошибки единого envelope + `requestId`.
- Versioning `/api/v1`.
- Filter/sort whitelist (см. `crud-table`).
- Idempotency-Key на критичных POST.

## 4. Frontend

- State: Zustand/Jotai default mid-size; Redux если сложно; Context для theme/auth shell.
- Нормализация списков при сложном графе.
- RHF + Zod; AbortController на unmount.
- Оптимизации memo/callback — по профилю, не везде.

## 5. Паттерны

Repository, Service, Adapter (email/storage/payment), Middleware, Observer (events/socket).  
Singleton — только для infra clients (db/redis/logger).

## 6. Security (OWASP Top 10 → контроли)

Injection→ORM/Zod; Auth→JWT httpOnly+refresh rotation; Access control→server RBAC; XSS→sanitize/CSP; Misconfig→CORS least privilege; Logging→security events; Deps→audit.

HTTPS prod; CSRF для cookie mutations; rate limit public.

## 7. Testing & CI

Unit → Integration → E2E critical paths; k6 на NFR change.  
PR: lint, typecheck, unit, build. Main: integrate + deploy staging.

## 8. Observability

Metrics (latency/errors), logs (pino), tracing optional for distributed.

## 9. Coding for Cursor

TypeScript strict, no `any`, small functions, JSDoc public only, import groups, aliases.

## 10. Project bootstrap checklist (фильтровать по ТЗ)

TypeScript strict, ESLint, tests, CI, logger, Redis if needed, migrations, OpenAPI, rate limit, CSRF as needed, JWT, README.

## 11. Как фабрика применяет этот модуль

| Шаг | Использование |
|-----|----------------|
| 02 constitution | coding + security baseline |
| 03 architecture | layers, feature folders, patterns |
| 04 data/api | 3NF, indexes, pagination, error envelope |
| 06 NFR | when to denormalize/replicas |
| 07 prompts | DoD ссылается на checklist |
| 09 library | не противоречить канону |

**Оговорка:** каждый пункт checklist → `must` / `should` / `later` в `OUTPUT` относительно ТЗ.

## CONFLICTS with other modules

| С другим модулем | Проблема | Решение |
|------------------|----------|---------|
| Любой feature | Чеклист vs YAGNI | Только must/should/later в METHODOLOGY_APPLY — не внедрять всё |
| `crud-table` | Offset vs cursor | Следовать NFR; крупные таблицы → cursor |
| Смена стека (Go/Java) | Примеры в feature SPEC на Node | ADAPTATION + stack-policy; не копировать Express as-is |
