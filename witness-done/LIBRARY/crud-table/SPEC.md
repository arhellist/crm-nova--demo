# LIBRARY MODULE: crud-table

## Назначение

Универсальный паттерн list/CRUD: фильтры, поиск, sort whitelist, пагинация, bulk actions, CSV export; конфигурируемая React-таблица.

## Когда использовать

- Админские и кабинетные списки сущностей (users, orders, products…).
- Нужен один UX-паттерн на много сущностей.

## Когда не использовать

- Одна простая сущность без фильтров — достаточно ручного endpoint.
- Аналитика/OLAP — не этот модуль.
- GraphQL-only стек — адаптировать контракт, не тащить REST as-is без ADR.

## Зависимости

- `logging-pino` (requestId в ошибках).
- Часто: `admin-panel`, `rate-limiting` на export.
- Пагинация: для больших таблиц **обязателен cursor** (см. methodology).

## Улучшения

- **Sort/filter field whitelist** — никогда не подставлять сырое имя колонки в SQL/ORDER BY.
- Default: offset для <~100k; в SPEC сущности явно выбрать cursor (`createdAt,id`).
- `COUNT(*)` — отдельный запрос / приближённый count / `hasMore` без total (зафиксировать в ADAPTATION).
- Bulk-delete: лимит ids (напр. 100), транзакция, authz на каждую запись или ownership scope.
- Export: stream CSV, тот же filter pipeline, timeout/rate limit; не грузить всё в память.

---

## 1. Query contract

```text
page, limit | cursor, limit
sort=field:asc|field:desc   # только whitelist
q=                          # search across searchFields
filter[field]= / field_gte / field_lte / field_eq
```

Response:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 123,
    "totalPages": 7,
    "nextCursor": null,
    "hasMore": false
  }
}
```

`total` опционален при cursor-режиме.

## 2. Endpoints (шаблон `/api/{entities}`)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/` | list |
| GET | `/:id` | detail |
| POST | `/` | create + Zod |
| PUT/PATCH | `/:id` | update + ownership/admin |
| DELETE | `/:id` | soft default |
| POST | `/bulk-delete` | `{ ids: string[] }` |
| GET | `/export` | CSV, same filters |

## 3. Backend structure

```text
routes → controller → service → repository/model
validators/*Schemas.ts
query/parseListQuery.ts   # whitelist + coerce
```

Service строит `where/order` только из parsed query object.

## 4. Frontend

Components: `Table`, `TableFilters`, `TableSearch`, `TablePagination`, `TableBulkActions`.  
Hooks: `useTable` (URL-synced state предпочтительно), `useTableData`, `useTableSelection`.

Config example — колонки, `searchFields`, `defaultSort`, `bulkActions`, filter types (`text|select|date|boolean`).

Синхронизация фильтров с query string — чтобы шарить ссылки.

## 5. Security

- AuthZ list scope (tenant/user/admin).
- Whitelist sort/filter.
- Export permission отдельным permission flag.
- XSS: не `dangerouslySetInnerHTML` в cell render без санитайза.

## 6. Тесты

- [ ] Invalid sort field → 400
- [ ] Filter date range
- [ ] Pagination stable
- [ ] Bulk delete respects authz
- [ ] Export respects filters

## 7. Антипаттерны

- Dynamic `ORDER BY ${req.query.sort}`
- N+1 в list (include/join заранее)
- Export без лимита/стрима
- Дублирование filter logic FE/BE вразнос

## 8. Критерии готовности

List query parser + whitelist, CRUD, soft delete, bulk+export, table config FE, URL state, тесты.

## CONFLICTS with other modules

| С другим модулем | Проблема | Решение |
|------------------|----------|---------|
| `admin-panel` | Admin users list | Тот же parser + admin scope; не копипастить SQL |
| `search` | `q` vs full-text | Простой LIKE/whitelist в crud; сложный поиск — модуль search |
| `rate-limiting` | `/export` тяжёлый | Отдельный лимит + stream |
| `caching-redis` | Кеш list | Versioned keys; invalidate на write |
| `auth-jwt` | Scope списка | Всегда фильтр ownership/tenant на сервере |
