# Модули — NOVA CRM

> Сгенерировано Witness Done v1.31.0. Контракты модулей: что внутри, чем владеет, от кого зависит.
> Детали архитектуры — `docs/03_architecture.md`, план модулей LIBRARY — шаг 07.

## Frontend

| Модуль | Ответственность | Владеет данными | Зависит от | Публичный контракт |
|--------|-----------------|-----------------|------------|--------------------|
| `shared/ui` | дизайн-система: кнопки, поля, бейджи статусов, панели, модалки, скелетоны | — | design-notes | компоненты + варианты |
| `shared/api` | клиент PostgREST/RPC, клиент отчётов, маппинг ошибок `P0400/P0403/P0422`, Zod-схемы ответов | — | Supabase JS, backend API | `apiClient`, `reportsClient`, `mapDbError` |
| `shared/lib` | форматирование дат и чисел, статусные словари, `useDebounce` | — | — | утилиты |
| `auth` | сессия, guard маршрутов, шаг MFA, выход | — | Supabase Auth | `useSession`, `RequireAuth`, `login`, `logout` |
| `objects` | список с поиском, создание, правка, архивирование, карточка объекта | — | `shared/api`, PostgREST, `rpc.archive_object` | `ObjectsPage`, `ObjectPage`, `useObjects`, `useObject` |
| `tasks` | создание задачи, карточка, доступные действия, история | — | `shared/api`, `rpc.change_task_status`, `rpc.archive_task` | `TaskPage`, `useTask`, `useHistory`, `useAvailableActions` |
| `my-tasks` | свои задачи по статусам со счётчиками | — | `shared/api` | `MyTasksPage`, `useMyTasks` |
| `reports` | экран отчётов, индикатор актуальности, деградация | — | backend API | `ReportsPage`, `useReport` |
| `app` | маршруты, оболочка, провайдеры, error boundary | — | все FE-модули | `App`, маршрутная таблица |

Правило: FE-модуль не обращается к таблицам другого модуля напрямую; данные приходят через
публичный hook модуля-владельца (например, карточка задачи не читает `objects` сама).

## База данных (PostgreSQL 15, Supabase)

| Модуль | Ответственность | Владеет данными | Публичный контракт |
|--------|-----------------|-----------------|--------------------|
| `domain-sql/schema` | таблицы, enum, ограничения, индексы | `profiles`, `objects`, `tasks`, `task_status_history` | DDL в миграциях |
| `domain-sql/access` | RLS-политики, гранты, помощники `is_manager()`, `current_role()` | политики | права, проверяемые pgTAP |
| `domain-sql/workflow` | `rpc.change_task_status`, триггеры `guard_task_status`, `log_task_status`, `validate_task_actors` | история переходов | RPC + коды `P0403/P0422/P0400` |
| `domain-sql/archive` | `rpc.archive_object`, `rpc.archive_task` | `deleted_at` | RPC |

## Backend и реплика

| Модуль | Ответственность | Владеет данными | Зависит от | Публичный контракт |
|--------|-----------------|-----------------|------------|--------------------|
| `reporting-api/routes` | маршруты отчётов, health, metrics | — | `reporting-api/db` | `GET /api/reports/*`, `/health`, `/health/replication`, `/metrics` |
| `reporting-api/db` | пул `pg`, запросы к вьюхам, кэш 30 с | — | реплика | функции `fetchObjectsReport` и др. |
| `reporting-api/security` | проверка `API_TOKEN`, allowlist `Origin`, rate limit, redact логов | — | конфиг | fastify-плагины |
| `replica-infra` | публикация/подписка, роль `nova_ro`, отчётные вьюхи, сверка | вторичная БД | Supabase | `nova_pub`, `nova_sub`, `report_*`, `check.mjs` |

## Эксплуатация

| Модуль | Ответственность | Публичный контракт |
|--------|-----------------|--------------------|
| `ops/monitoring` | дашборды, правила алертов, uptime | конфиги Grafana/Cloudflare |
| `ops/runbooks` | инцидент, восстановление, ротация секретов, провижининг, релиз | `docs/runbooks/*` |
| `ops/ci` | джобы CI, гейты безопасности, релизный пайплайн | `.github/workflows/ci.yml` |
