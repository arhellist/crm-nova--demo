# DEC-031 — D14: production-сборка SPA получила конфиг сборки и хост с заголовками

| Поле | Значение |
|------|----------|
| Дата | 2026-11-04 |
| Intake | — |
| Статус | принято |
| ADR | ADR-0006 |
| Заменяет | — |

**Контекст.** Приёмка A14.1/A14.2 требует production-сборку SPA и CSP из §7 ТЗ, но в
репозитории не было `vite.config.ts` (сборка шла в `dist/`, тот же каталог, куда пишет
`tsc` backend), не было `vercel.json` — то есть заголовков, которые отдаёт хост, — и не
было способа поднять staging на production-сборке: `vite preview` заголовки не применяет.
Контурный смоук при этом обращался к `/metrics` без Bearer (эндпоинт защищён токеном) и
слал прямой PATCH статуса в отчётный API вместо Supabase, поэтому «зелёный» прогон
доказывал не то, что заявлено.

**Решение.** В PRODUCES D14 добавлены `vite.config.ts` (production-сборка в `dist/web`,
sourcemap выключен), `vercel.json` (CSP и OWASP-заголовки §7 как единственный источник
заголовков production-хоста) и `scripts/release/serve-preview.mjs` (staging-хост
production-сборки, который читает заголовки из `vercel.json`; `connect-src` продлевается
только origin'ами из `STAGING_CONNECT_SRC`). `scripts/smoke/product-smoke.sh` исправлен:
`/metrics` вызывается с Bearer, прямой PATCH и регистрация проверяются на `SUPABASE_URL`,
добавлены проверки `/health/replication` = streaming, `source: replica` в отчётах и
`X-Content-Type-Options`. Добавлены скрипты `build:web` и `preview:staging`.

**Альтернативы.** Оставить `vite build` без конфига — сборка фронтенда и backend делят
`dist/`, `check-no-secrets.sh` сканирует смешанный артефакт, а `npm run build` затирает
SPA. Проверять CSP на dev-сервере — запрещено INVARIANTS D14 (только production-сборка).
Хранить CSP в коде сервера предпросмотра — тогда проверялся бы не тот заголовок, который
отдаст Vercel. Принят `vercel.json` как источник и staging-хост, читающий его.

**Чем подтверждено.** `npm run build:web` → `dist/web` (166 модулей, без sourcemap);
`preview:staging` отдаёт `/login` 200, CSP с `frame-ancestors 'none'` и без `unsafe-eval`;
`product-smoke.sh` на локальном staging-контуре — все проверки A14.1 зелёные; e2e 17
сценариев на этой же сборке.
