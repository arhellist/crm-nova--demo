# DEC-023 — D10 дополнительно создаёт infra/replica/api.Dockerfile и infra/replica/init/0…

| Поле | Значение |
|------|----------|
| Дата | 2026-11-04 |
| Intake | — |
| Статус | принято |
| ADR | — |
| Заменяет | — |

**Контекст.** A10.1 требует, чтобы `docker compose up -d` поднимал `replica` и `api`, но ни один
срез до D10 не создавал Dockerfile: backend запускался только через `npm run dev`. Кроме того,
подписчик — чистый `postgres:16` без Supabase-схемы: миграции 0001–0007 ссылаются на
`auth.users`, `auth.uid()` и роли `anon`/`authenticated`, без заглушек они не накатываются.
`check.mjs` и отчётный API D11 нуждаются в драйвере `pg`, которого не было в зависимостях.

**Решение.** D10 дополнительно создаёт infra/replica/api.Dockerfile и infra/replica/init/000_auth_stub.sql и добавляет зависимость pg: compose обязан поднимать backend из этого же кода, миграции Supabase на чистом postgres:16 требуют заглушек auth.users/auth.uid и ролей anon/authenticated, а check.mjs и будущий отчётный API используют pg; PRODUCES D10 расширены до 8 путей

**Альтернативы.** (1) Запускать backend в compose через `node:20-alpine` и bind-mount репозитория
с `npm ci && npm run build` на старте — отвергнуто: сборка в рантайме, нет фиксированного образа,
секреты и node_modules попадают в контейнер. (2) Использовать образ `supabase/postgres` для
подписчика — отвергнуто: D10 требует PostgreSQL 16, а Supabase-образ несёт лишние сервисы.
(3) Выполнять `check.mjs` через `psql`-подпроцессы — отвергнуто: разбор ошибок и кодов SQLSTATE
хрупкий, а D11 всё равно требует `pg`. (4) Не накатывать миграции на реплику и создать четыре
таблицы вручную — отвергнуто: дублирование схемы ломает NFR19 и ADR-0003.

**Чем подтверждено.** `infra/replica/compose.test.mjs` (A10.1: образ, healthcheck, порядок init,
отсутствие primary в окружении `api`, USER node), `infra/replica/check.test.mjs` (A10.2–A10.4),
`supabase/tests/views_test.sql` (вьюхи и агрегаты на реплике), `package.json` (`pg`, `@types/pg`);
`sp verify --d D10 --gate pre_ci` c `tax_pass: true`.
