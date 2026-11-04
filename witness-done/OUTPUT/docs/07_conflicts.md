# Конфликты модулей — NOVA CRM

> Сгенерировано Witness Done v1.31.0. Один файл на проект. Blocker без решения → `needs_human`;
> в этом прогоне blocker'ов нет.

## 1. Конфликты включённых модулей

| Пара | Проблема из SPEC | Решение в проекте | Статус |
|------|------------------|-------------------|--------|
| `auth-jwt` × `rate-limiting` | brute-force на вход | tier `auth`: WAF + лимиты Supabase Auth + блокировка после 10 неудач за 10 минут; API-лимит на `/api/*` отдельный | закрыт |
| `auth-jwt` × `logging-pino` | секреты в логах | redact `authorization`, `cookie`, `apikey`, `password`, `*token*`; тест на строку лога | закрыт |
| `auth-jwt` × `caching-redis` | общий Redis | Redis отсутствует; кэша сессий нет | не применимо |
| `crud-table` × `auth-jwt` | scope списка | ownership-фильтр в RLS, а не в параметрах запроса; UI не передаёт `user_id` | закрыт |
| `crud-table` × `search` | `q` vs full-text | поиск только LIKE по `title`/`address` с btree `lower(...)`; модуль `search` не включён | не применимо |
| `crud-table` × `rate-limiting` | тяжёлый export | export отсутствует (вне продукта) | не применимо |
| `crud-table` × `caching-redis` | кэш списков | TanStack Query с инвалидацией по мутациям; серверного кэша списков нет | не применимо |
| `logging-pino` × `admin-panel` | audit ≠ logs | журнал действий домена — `task_status_history`; UI-админки нет | закрыт |
| `rate-limiting` × trust proxy | неверный IP | `trust proxy` = адреса Cloudflare, проверка в integration-тесте (`X-Forwarded-For`) | закрыт |
| `rate-limiting` × `caching-redis` | один Redis | Redis отсутствует; store — память процесса, ослабление при multi-instance задокументировано | не применимо |
| `methodology-architecture` × `meta-prompt-generator` | расхождение стиля | `meta-prompt-generator` не включён; D-промпты генерирует фабрика по своему шаблону | не применимо |

## 2. Конфликты с архитектурными решениями

| Пара | Проблема | Решение | Статус |
|------|----------|---------|--------|
| `auth-jwt` (cookie) × ADR-0005 (Bearer) | референс предполагает httpOnly-cookie, проект — заголовок | принято ADR-0005: cookie нет, CSRF-модель строится на отказе от cookie; переход на BFF — отдельный пакет изменения | закрыт осознанно |
| `crud-table` (offset/COUNT) × NFR1 | offset-пагинация и `COUNT(*)` не укладываются в бюджет | keyset + `hasMore`, `COUNT(*)` не используется | закрыт |
| `caching-redis` × NFR4 | без Redis отчёты должны укладываться в 300 мс | кэш 30 с в процессе + индексы на реплике; замер k6 подтверждает | закрыт |
| `search` × NFR1 | полнотекстовый поиск потребовал бы GIN/`pg_trgm` | поиск по подстроке на 5 000 объектах укладывается; триггер перехода на `pg_trgm` — 50 000 строк | закрыт с триггером |

## 3. Blocker'ы

Нет. Все конфликты либо закрыты решением, либо неприменимы из-за отсутствия модуля в продукте.
