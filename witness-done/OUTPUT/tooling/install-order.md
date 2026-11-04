# Порядок установки и проверки

> Сгенерировано Witness Done v1.31.0. Единая последовательность для локальной машины и CI.

## 1. Установка

```bash
# 1. Зависимости (монорепо: npm workspaces — web, backend, e2e, scripts)
npm ci

# 2. Локальный Supabase (PostgreSQL 15, Auth, PostgREST, RPC)
supabase start
supabase db reset          # миграции + seed

# 3. Локальный контур отчётности (PostgreSQL 16 + Fastify)
docker compose up -d --build
docker compose ps          # api: healthy, replica: healthy

# 4. Переменные окружения
cp .env.example .env.local
# заполнить VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, DATABASE_URL (реплика), API_TOKEN
```

## 2. Обязательный порядок проверок

```text
lint → typecheck → test → test:db → test:backend → test:e2e → sp verify --gate pre_ci
```

| Шаг | Команда | Что ловит |
|-----|---------|-----------|
| lint | `npm run lint` | стиль, запреты (`any`, `eval`, `console.log`), локальные правила |
| typecheck | `npm run typecheck` | ошибки типов strict в web и backend |
| test | `npm run test` | unit (Vitest) для UI, хуков, утилит, маршрутов API |
| test:db | `supabase test db` | RLS, переходы, история (pgTAP) |
| test:backend | `npm run test:backend` | интеграция отчётов с репликой, 405 на write |
| test:e2e | `npm run test:e2e` | 8 сквозных сценариев Playwright |
| pre_ci | `node witness-done/SEED/sp-tools/sp-verify.mjs --d Dxx --gate pre_ci` | акт приёмки задания |

Порядок нельзя менять: `typecheck` после `lint` экономит прогон тестов на синтаксических ошибках,
`pre_ci` идёт последним, потому что читает результаты всех предыдущих.

## 3. Локальный контур: что где

| Сервис | Порт | Назначение |
|--------|------|------------|
| Supabase API | 54321 | PostgREST, Auth, RPC |
| Supabase DB (primary) | 54322 | PostgreSQL 15 |
| Supabase Studio | 54323 | просмотр схемы и данных |
| Реплика PostgreSQL 16 | 5433 | вторичная БД (только чтение) |
| Fastify API | 8080 | отчёты, health, metrics |
| Vite dev server | 5173 | SPA |

Порты зафиксированы в `docker-compose.yml` и `.env.example`; менять их в коде нельзя.

## 4. Перед первым коммитом

```bash
node witness-done/SEED/sp-tools/sp.mjs rules --check    # exit 0
node witness-done/SEED/sp-tools/sp.mjs doctor --strict
node witness-done/SEED/sp-tools/sp.mjs journal --check --strict
```

pre-commit-хук установлен на шаге 00 и запускает `sp doctor --staged`.
