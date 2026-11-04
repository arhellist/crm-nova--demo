# CI/CD и окружения — NOVA CRM

> Сгенерировано Witness Done v1.31.0. Канон: `catalogs/cicd-environments.md`.
> Реальный workflow: `.github/workflows/ci.yml`. Образец: `OUTPUT/tooling/ci.yml.example`.

## 1. Окружения

| Env | Frontend | Backend / реплика | Primary БД | Auth | Внешние сервисы |
|-----|----------|-------------------|-----------|------|-----------------|
| **local** | Vite `127.0.0.1:5173` | Docker `127.0.0.1:8080` + PostgreSQL 16 `5433` | Supabase CLI `54322` | локальный GoTrue | нет (всё локально) |
| **ci** | build-only | service-контейнеры Postgres 16 (primary + replica) | `supabase start` | локальный GoTrue | моки, `API_TOKEN` тестовый |
| **staging** | Vercel preview (`staging.nova.example`) | контур backend staging (Docker, приватная сеть) | отдельный проект Supabase | отдельные ключи | Sentry staging, Grafana staging |
| **production** | Vercel production (`nova.example`) | изолированный контур backend | Supabase Cloud (PITR) | production project | Sentry, Grafana Cloud, uptime, Cloudflare |

Секреты окружений — `OUTPUT/tooling/env-vars.md` и `OUTPUT/security/secrets-and-config.md`.
Prod-ключи никогда не попадают в CI PR-джобы.

## 2. PR (pull request)

1. `checkout` → `npm ci` (lockfile).
2. `lint` + `typecheck` + `lint:guards` (запрет `any`, `@ts-ignore`, `console.log`).
3. `test` (unit, покрытие как артефакт).
4. `db-test` (`supabase db reset` + `supabase test db`, pgTAP).
5. `backend` (integration + read-only 405).
6. `replication-test` (публикация → подписка, сверка).
7. `security` (gitleaks, grep `service_role`, `npm audit --audit-level=high`, CSP-конфиг).
8. `e2e` (Playwright, 8 сценариев, против локального Supabase).
9. `entry-and-rules` (`sp rules --check`, `sp doctor --strict`).
10. `evidence-gate` (`sp-verify --gate evidence-sync`).

**Деплоя из PR нет.** Ни одна джоба не имеет `continue-on-error`.

## 3. Staging (merge в `main`)

Отдельный workflow `deploy-staging.yml`, `environment: staging`:

1. Повтор `lint/test/doctor` (не доверяем кэшу PR).
2. Миграции в staging: `supabase db push` (expand, forward-only).
3. Деплой backend: сборка образа с тегом `sha-<short>`, `docker compose up -d`, ожидание
   `/health` и `/health/replication` (timeout 120 с).
4. Деплой frontend: Vercel preview → alias `staging.nova.example`.
5. Smoke: `/health`, `/health/replication`, вход, список объектов, «Мои задачи», отчёт.
6. **Wave API-smoke** затронутого контура: `scripts/smoke/wave-api-smoke.sh <group>`.
7. Журнал релиза в PR/issue: тег образа, коммит, время, результат smoke.

## 4. Production (подтверждение)

Отдельный workflow `deploy-production.yml`, `workflow_dispatch` + `environment: production`
(required reviewers):

1. `sp-verify --gate pre_release` локально до запуска; акт приложен к релизу.
2. `sp-verify --gate product-smoke` (полный прогон, runbook `docs/runbooks/product-smoke.md`).
3. Миграции production (expand; contract — отдельным релизом).
4. Деплой backend (тот же тег, что прошёл staging) → проверка health.
5. Деплой frontend (Vercel production, атомарно).
6. Полный product-smoke по runbook + проверка CSP-заголовков на production-домене.
7. Запись в журнал релизов: версия, тег, кто подтвердил, время, результат.

## 5. Порядок развёртывания (runtime)

```text
1. Миграции primary (expand)         — до любого кода
2. Миграции реплики + отчётные вьюхи — до запуска API
3. Подписка nova_sub                 — после схемы и данных
4. Backend (api)                     — ждём /health и /health/replication
5. Frontend                          — после успешного API
6. Smoke                             — health, вход, списки, переход, отчёт
```

Причина порядка: код не должен читать колонку, которой ещё нет; API не должен стартовать без
реплики (иначе отчёты падают на старте); frontend не должен открываться до готового API.

## 6. Rollback

| Что | Как | Время |
|-----|-----|-------|
| Frontend | Vercel Instant Rollback на предыдущий деплой | ≤ 2 мин |
| Backend | предыдущий тег образа `sha-<prev>` + `docker compose up -d` | ≤ 5 мин |
| Миграции | forward-fix; откат схемы не выполняется (expand/contract) | по ситуации |
| Полный релиз | последовательность выше, затем smoke | ≤ 15 мин (NFR9) |

Если инцидент связан со схемой: остановить запись (UI-баннер «техработы»), подготовить
forward-fix миграцию, применить, проверить, снять баннер. Откат данных — только через PITR
(runbook восстановления).

## 7. Секреты

Имена и окружения — `env-vars.md`. Prod ≠ staging: разные проекты Supabase, разные `API_TOKEN`,
разные `REPLICATOR_PASSWORD`. GitHub Environments `staging`/`production` хранят значения;
в логи не выводятся (`::add-mask::` для динамических).

## 8. Контуры приёмки

| Контур | Когда | Команда |
|--------|-------|---------|
| `pre_ci` | локально до push, после каждого D | `sp-verify --d Dxx --gate pre_ci` |
| CI unit | на PR | джобы `lint-and-typecheck`, `test`, `db-test`, `backend` |
| wave API-smoke | после `split_group` | `scripts/smoke/wave-api-smoke.sh <group>` |
| `pre_release` | перед staging/prod | `sp-verify --gate pre_release` |
| product-smoke | перед production | `sp-verify --gate product-smoke` |
