# План модулей LIBRARY — NOVA CRM

> Сгенерировано Witness Done v1.31.0. Библиотека живёт только в `witness-done/LIBRARY/`; её SPEC
> не копируются в OUTPUT. `id` модуля — идентификатор контракта, а не обязательная библиотека.
> Канон: `catalogs/stack-policy.md`, `catalogs/language-policy.md`, `PROFILES.md`.

## 1. Решения по модулям

| id | Вердикт | Зачем | SPEC | Целевые Dxx |
|----|---------|-------|------|-------------|
| `auth-jwt` | **adapt** | контракт JWT/сессии, но реализация — Supabase Auth (GoTrue): access+refresh, ротация refresh, `signOut global`, MFA | `LIBRARY/auth-jwt/SPEC.md` | срез S3 (вход и оболочка) |
| `crud-table` | **adapt** | паттерн списков: фильтры, поиск, sort whitelist, keyset-пагинация, состояния, bulk отсутствует | `LIBRARY/crud-table/SPEC.md` | срезы S4, S5, S6 (объекты, задачи, «Мои задачи») |
| `logging-pino` | **include** | единый структурный лог backend: `request_id`, child-loggers, redact | `LIBRARY/logging-pino/SPEC.md` | срез S0 (каркас), S7 (API отчётов) |
| `rate-limiting` | **include** | лимит 60/мин на `API_TOKEN`, tier «auth» для входа на периметре | `LIBRARY/rate-limiting/SPEC.md` | срез S7, S9 (эксплуатация) |
| `admin-panel` | **skip** | провижининг вне UI (ТЗ §2.2) | `LIBRARY/admin-panel/SPEC.md` | — |
| `file-upload` | **skip** | файлы и фотоотчёты вне продукта | `LIBRARY/file-upload/SPEC.md` | — |
| `websocket-socketio` | **skip** | realtime-доска не входит в продукт; инвалидация через TanStack Query | `LIBRARY/websocket-socketio/SPEC.md` | — |
| `search` | **skip** | полнотекстовый поиск вне продукта; нужен простой LIKE с индексом | `LIBRARY/search/SPEC.md` | — |
| `email-nodemailer` | **skip** | писем нет: доступы выдаёт администратор, восстановление пароля отключено | `LIBRARY/email-nodemailer/SPEC.md` | — |
| `payments-stripe` | **skip** | монетизации нет, PCI DSS вне области | `LIBRARY/payments-stripe/SPEC.md` | — |
| `caching-redis` | **skip** | кэш — LRU 30 с в процессе API + TanStack Query; Redis не окупается при 30 RPS | `LIBRARY/caching-redis/SPEC.md` | — |
| `methodology-architecture` | **include (как канон)** | методология слоёв и контрактов применяется при нарезке D | `LIBRARY/methodology-architecture/SPEC.md` | все срезы |
| `meta-prompt-generator` | **skip** | не относится к продукту; фабрика сама генерирует D | `LIBRARY/meta-prompt-generator/SPEC.md` | — |

Категории `later` нет: всё, что не входит в продукт, — `skip` с причиной; «на будущее» в план
не попадает (`catalogs/completeness-policy.md`).

## 2. Отличия от SPEC (adapt/include)

### `auth-jwt` → adapt

- Референс: собственная реализация на Express + bcrypt + refresh в PostgreSQL + httpOnly-cookie.
  Проект: **Supabase Auth**. Контракт сохраняется (access для API, refresh с ротацией, logout-all),
  реализация делегирована платформе; собственной таблицы сессий нет.
- Cookie не используются: токен в `Authorization`. Это осознанно меняет CSRF-модель (см. ADR-0005).
- Роль — из `profiles`, не из JWT. Открытая регистрация и reset по email отсутствуют.
- MFA (TOTP) — обязательное дополнение, которого в референсе нет.

### `crud-table` → adapt

- Списки на TanStack Query, таблица — собственные компоненты Tailwind + Radix (референс предлагает
  конфигурируемую таблицу; тяжёлый table-фреймворк не берём).
- Пагинация — keyset `(created_at, id)`; `offset` и `COUNT(*)` не используются, `hasMore` — по
  `limit + 1`. Bulk actions и CSV-export отсутствуют (вне продукта).
- Sort whitelist: только `created_at` для объектов и задач; фильтр по `status` для задач.
- Состояния: скелетон, пусто, ошибка, нет доступа — обязательны на каждом списке.

### `logging-pino` → include

- pino в Fastify; `request_id` принимается из `X-Request-Id` только если это UUID, иначе генерируется
  (защита от log injection). Redact: `authorization`, `cookie`, `apikey`, `password`, `*token*`.
- `console.log` запрещён (grep-гейт). Pretty-транспорт — только `NODE_ENV=development`.
- Аудит домена — не логи, а `task_status_history` (CONFLICTS модуля соблюдён).

### `rate-limiting` → include

- `@fastify/rate-limit`, store — память процесса (один инстанс API), ключ — `API_TOKEN`;
  при масштабировании на два инстанса — документированное ослабление ×N.
- Tier `auth` на периметре (Cloudflare/WAF) для `/login`; отдельный счётчик в Supabase Auth.
- `trust proxy` включён согласованно с Cloudflare, иначе IP будет адресом прокси.
- Метрика `rate_limit_hit_total{tier,route}`, заголовки `RateLimit-*`, ответ `429 E_RATE_LIMITED`.

## 3. Синхронизация контрактов

- `specs/openapi.yaml` — контур отчётов целиком (включая `429`, `E_RATE_LIMITED`).
- `specs/openapi-outline.md` — Supabase-контур: PostgREST-таблицы и RPC; помечены как
  `from: LIBRARY/auth-jwt (adapt)` для входа и `from: LIBRARY/crud-table (adapt)` для списков.
- `specs/data-model.md` — `profiles` без паролей/сессий: их нет в приложении (Supabase Auth).
- `security/authn-authz.md` — контракт auth-jwt переработан под MFA и роль из БД.

Дополнительных endpoint'ов включённые SPEC не добавляют: их контракты уже покрыты.

## 4. Gaps

Модулей, отсутствующих в LIBRARY и нужных продукту, нет. Два собственных контракта описаны
в `specs/modules.md` без LIBRARY-аналога:

- `read-replica-reporting` — репликация и отчётные вьюхи (нет в LIBRARY, описано в ADR-0003 и
  `specs/data-model.md` §9; отдельный gap-файл не нужен, ТЗ уже содержит требования).
- `status-workflow` — машина состояний и история (реализуется SQL, описано в `specs/domain-rules.md`).

## 5. Соответствие профилю

Профиль `web-app`: `auth-jwt` + `crud-table` покрывают основу; `admin-panel` снят осознанно
(провижининг вне UI). Добавлен акцент read-only backend: `logging-pino` и `rate-limiting`
обслуживают его. Отклонения зафиксированы в `MANIFEST`.
