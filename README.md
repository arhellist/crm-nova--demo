# NOVA CRM

Закрытая веб-CRM строительной компании: объекты, задачи, цикл из пяти статусов,
неизменяемая история переходов и отчёты с вторичной реплики. Продукт поставляется целиком:
вход с MFA, объекты, задачи, отчёты, эксплуатационные runbook'и и приёмка.

- Стек и границы: `witness-done/OUTPUT/docs/03_architecture.md`, ADR-0001…0007.
- Решения и остаточные риски: [`docs/decisions.md`](docs/decisions.md).
- Регламенты эксплуатации: [`docs/runbooks/`](docs/runbooks/).
- Правила разработки: [`AGENTS.md`](AGENTS.md).

## 1. Быстрый старт (≤15 минут)

Требования: Node.js 20 LTS, npm 10, Docker, Supabase CLI (`npx supabase`), свободные порты
54321–54324 (Supabase) и 5173/8080 (приложение и отчётный API).

```sh
git clone <repo> nova-crm && cd nova-crm
npm ci
cp .env.example .env.local          # заполнить значения из npx supabase status
npx supabase start                   # PostgreSQL 15, Auth, PostgREST, Studio
npx supabase db reset                # миграции + seed (идемпотентно)
npm run dev                          # frontend (Vite) + backend отчётности
```

Проверка: открыть `http://127.0.0.1:5173`, войти учётной записью менеджера из seed,
подтвердить TOTP, создать объект и задачу. Отчёты доступны менеджеру в разделе «Отчёты».

> Если `npm ci` не устанавливает Playwright-браузеры: `npm run e2e:install` (нужно только
> для e2e, на запуск приложения не влияет).

## 2. Переменные окружения

Полный список и правила хранения — `witness-done/OUTPUT/tooling/env-vars.md`.
Секреты никогда не коммитятся; `service_role` не попадает ни в клиент, ни в backend (INV-006).

### Frontend (Vite, публичные)

| Переменная | Назначение |
|------------|------------|
| `VITE_SUPABASE_URL` | URL проекта Supabase |
| `VITE_SUPABASE_ANON_KEY` | anon-ключ (публичный, ограничен RLS) |
| `VITE_REPORT_API_URL` | базовый URL отчётного API |
| `VITE_REPORT_API_TOKEN` | read-only токен отчётов (DEC-025) |

### Backend отчётности (только чтение)

| Переменная | Назначение |
|------------|------------|
| `PORT` | порт API, по умолчанию 8080 |
| `API_TOKEN` | Bearer-токен отчётов, ≥32 символов, сравнение timing-safe |
| `DATABASE_URL_REPLICA` | строка подключения к реплике от `nova_ro`; primary запрещён |
| `ALLOWED_ORIGINS` | список origin через запятую для CORS |
| `LOG_LEVEL` | `info` в production, `silent` в тестах |
| `NODE_ENV` | `production` включает строгие проверки конфигурации |

### e2e (только стенд)

`E2E_BASE_URL`, `E2E_API_URL`, `E2E_MANAGER_EMAIL/PASSWORD/TOTP_SECRET`,
`E2E_EXECUTOR1_*`, `E2E_EXECUTOR2_*`, `E2E_AUTH_DIR` (по умолчанию временный каталог).

### Release-скрипты

`VERSION`, `PREVIOUS_TAG`, `FE_URL`, `RELEASE_JOURNAL`, `DRY_RUN=1` для локальной проверки.

## 3. Миграции и seed

- Миграции лежат в `supabase/migrations/`, применяются только вперёд (`npx supabase db push`).
- Ручная правка схемы запрещена; изменение — новая миграция.
- `supabase/seed.sql` создаёт профили, объекты и задачи; повторный запуск не дублирует данные.
- Учётные записи стенда: 1 менеджер (`manager@nova.local`) и 2 исполнителя
  (`executor1@nova.local`, `executor2@nova.local`). Пароли и TOTP-секрет — в seed для
  локального контура; в production они задаются при выпуске и не хранятся в git.

## 4. Контур реплики и отчётный backend

```sh
# Реплика PostgreSQL 16 и read-only роль nova_ro
docker compose -f infra/replica/docker-compose.yml up -d
docker compose -f infra/replica/docker-compose.yml ps

# Проверка подписки и вьюх
node infra/replica/check.mjs
```

Отчётный API читает только реплику:

```sh
API_TOKEN=<токен> DATABASE_URL_REPLICA=postgresql://nova_ro:...@127.0.0.1:5433/nova_replica \
  ALLOWED_ORIGINS=http://127.0.0.1:5173 npm run dev
```

Маршруты: `GET /health`, `GET /health/replication`, `GET /metrics`,
`GET /api/reports/objects|workload|status-ages`. Мутирующие методы возвращают `405` (INV-011).

## 5. Тесты и проверки

```sh
npm run lint
npm run typecheck
npm run test                 # Vitest: unit, RLS-контракты, отчётный API и UI
npx supabase test db         # pgTAP: RLS, переходы, история, архив, вьюхи
npm run e2e                  # Playwright: 17 сценариев приёмки на стенде
sh scripts/release/check-no-secrets.test.sh
sh scripts/release/deploy.test.sh
```

Приёмка фиксируется актами `witness-done/OUTPUT/evidence/Dxx.json`; слово «готово» без
`tax_pass: true` не существует.

## 6. Деплой и откат

```sh
VERSION=v1.0.0 PREVIOUS_TAG=v0.9.0 FE_URL=https://staging.nova.example \
  sh scripts/release/deploy.sh

VERSION=v1.0.0 PREVIOUS_TAG=v0.9.0 sh scripts/release/deploy.sh --rollback
```

Порядок: тег → forward-only миграции → staging → product smoke → production → журнал
`docs/releases.md`. Откат переключает production на предыдущий **неизменяемый тег** одной
командой; миграции не откатываются. Хронометраж деплоя и отката печатается и проверяется
на лимит 15 минут. Подробности — `witness-done/OUTPUT/tooling/deploy.md`.

## 7. Как устроен поток данных

```text
Браузер (React SPA)
  │  JWT в Authorization, без cookie
  ▼
Supabase (PostgREST + RPC + RLS + триггеры)  ── primary, единственный путь записи
  │  логическая репликация pgoutput
  ▼
PostgreSQL 16 (реплика) ──► Fastify read-only API ──► экран «Отчёты»
                              │
                              └─ /health, /health/replication, /metrics ──► Prometheus/Grafana
```

- Запись задачи и смена статуса — только через `rpc.change_task_status`; прямой `UPDATE`
  отклоняется триггером, запрещённый переход — кодом `P0422`.
- История `task_status_history` append-only: у клиента нет прав INSERT/UPDATE/DELETE.
- Отчёты содержат только агрегаты, помечены `source: replica` и `lag_seconds`; при лаге
  больше 30 секунд UI показывает предупреждение, при недоступности реплики — деградацию
  без падения остальных разделов.

## 8. Что это значит без терминов

NOVA CRM — это рабочий стол стройки. Руководитель заводит объект (например, «ЖК Север»)
и задачи по нему, назначает исполнителя. Исполнитель видит только свои задачи, берёт их
в работу, отправляет на проверку. Руководитель принимает или возвращает на доработку
с комментарием. Каждый переход сохраняется в неизменяемом журнале: кто, когда и почему.
Отчёты считаются на отдельной копии базы, поэтому даже при её отставании работа с задачами
не останавливается. Вход защищён вторым фактором, а все права проверяет сама база данных,
а не интерфейс.

## 9. Эксплуатация

- Инцидент: [`docs/runbooks/incident.md`](docs/runbooks/incident.md).
- Бэкап и восстановление: [`docs/runbooks/backup-restore.md`](docs/runbooks/backup-restore.md).
- Учения по остановке реплики: [`docs/runbooks/incident.drill.md`](docs/runbooks/incident.drill.md).
- Product smoke: `witness-done/OUTPUT/docs/runbooks/product-smoke.md`,
  скрипт `scripts/smoke/product-smoke.sh`.
- Алерты: `observability/prometheus/rules.yml`; дашборд: `observability/grafana/dashboard.json`.
