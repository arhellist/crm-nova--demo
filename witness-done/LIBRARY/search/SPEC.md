# LIBRARY MODULE: search

## Назначение

Поиск по сущностям: full-text + фильтры + suggest. Два бэкенда за одним интерфейсом — **PostgreSQL FTS** (до ~100k) или **Elasticsearch** (больше/сложнее).

## Когда использовать

- Глобальный поиск, каталог, подсказки в шапке.

## Когда не использовать

- Только `LIKE %q%` на одной маленькой таблице без роста — достаточно crud-table `q`.
- Нет согласия на ES ops — не выбирать Elasticsearch «на всякий случай».

## Зависимости

- Очередь: BullMQ + Redis (`caching-redis` infra).
- `logging-pino`, `rate-limiting` на `/api/search`.

## Улучшения

- Единый `SearchService` interface; выбор через `SEARCH_ENGINE=pg|elasticsearch`.
- Индексация **асинхронно** (outbox/queue), не блокировать HTTP write path.
- Highlight + score в ответе; пустой `q` → 400 или browse-only с фильтрами (зафиксировать).
- Suggest: отдельный лёгкий индекс/completion; debounce 300ms на FE.
- PG: `tsvector` + GIN; язык `russian`/`simple` в ADAPTATION.
- ES: mapping explicit; не dynamic unbounded.

---

## 1. SearchDocument (логический)

`id`, `type`, `title`, `content`, `category?`, `tags[]`, `createdAt`, `updatedAt`, `metadata`, ACL fields (`ownerId`/`visibility`) для фильтрации на поиске.

## 2. Indexing

- On create/update/delete entity → enqueue `search.index` / `search.delete`
- Worker upserts engine
- CLI `search:reindex` full rebuild
- DLQ + metrics на fail

## 3. API

### `GET /api/search`
Query: `q`, `type`, `category`, `from`, `to`, `limit`, `offset|cursor`, `sort=relevance|date`  
Response: `{ total, hits: [{ id, type, title, highlight, score, ... }] }`  
**AuthZ:** не возвращать документы вне прав пользователя.

### `GET /api/search/suggest`
`q`, `limit` → `[{ text, score }]`

## 4. Frontend

`SearchPage`, `SearchBar`, `SearchFilters`, `SearchResults`, `useSearch` (debounce suggest).

## 5. Структура

```text
backend/src/services/search/
  search.service.ts      # facade
  engines/{pg,elasticsearch}.ts
  search-indexer.ts
  search-queue.ts
```

## 6. Env

`SEARCH_ENGINE`, `ELASTICSEARCH_URL`, `SEARCH_INDEX_PREFIX`, `SEARCH_QUEUE_NAME`.

## 7. Тесты

- [ ] Index after create eventually searchable
- [ ] Delete removes from index
- [ ] AuthZ hides private hits
- [ ] Suggest debounce contract
- [ ] Reindex CLI dry-run

## 8. Антипаттерны

- Синхронный index в request без timeout
- Поиск без ACL (IDOR через search)
- Выбрать ES для 1k записей
- `keys`/full table scan вместо FTS index

## 9. Критерии готовности

Facade + один engine в v1 + async index + search/suggest APIs + FE + rate limit + tests.

## CONFLICTS with other modules

| С другим модулем | Проблема | Решение |
|------------------|----------|---------|
| `crud-table` | Два поиска | Search — relevance/FTS; crud `q` — простой filter |
| `caching-redis` / BullMQ | Очередь индексации | Общий Redis, префикс `search:` / queue names |
| `rate-limiting` | Дорогие запросы | Tier `route.search` |
| `auth-jwt` | IDOR через hits | Фильтр ACL в query engine |
| `admin-panel` | Reindex CLI | Только admin/ops |
