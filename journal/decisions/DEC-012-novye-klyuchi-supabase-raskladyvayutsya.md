# DEC-012 — Новые ключи Supabase раскладываются по контрактным именам OUTPUT/tooling/env-…

| Поле | Значение |
|------|----------|
| Дата | 2026-11-04 |
| Intake | 20261104-2122-env-supabase-prover-perechen-peremennyh |
| Статус | принято |
| ADR | — |
| Заменяет | — |

**Контекст.** Фактический файл `.env.supabase` (git игнорирует его через `.env.*`) перечисляет
переменные под именами нового поколения ключей Supabase: `VITE_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL`, плюс необъяснённую `PASS`.
Контракт `OUTPUT/tooling/env-vars.md`, схема `src/shared/config/env.ts` (строки 35–36) и уже
написанный клиент `src/features/auth/api.ts` (строка 32) ждут `*_ANON_KEY`. Ни `VITE_`-клиент, ни
`env.ts` таких имён не читают: фронтенд упадёт на валидации Zod с «Некорректная конфигурация
клиента», а backend просто выйдет с кодом 1, потому что `SUPABASE_ANON_KEY` опционален, но
`API_TOKEN` и `DATABASE_URL` отсутствуют. При этом `sb_secret_*` — полноценный обход RLS,
аналог `service_role`, и его попадание в backend/бандл нарушает INV-006.

**Решение.** Новые ключи Supabase раскладываются по контрактным именам `OUTPUT/tooling/env-vars.md`
без переименования контракта: `sb_publishable_*` → `VITE_SUPABASE_ANON_KEY` и `SUPABASE_ANON_KEY`,
`sb_secret_*` → `SUPABASE_SERVICE_ROLE_KEY` и только для локального seed/e2e (в backend, бандл,
CI-логи и Vercel не попадает, INV-006); `SUPABASE_JWKS_URL` в контракт не добавляем, пока ни один
PRODUCES его не читает (supabase-js получает JWKS сам, backend JWT не проверяет — отчёты
авторизуются `API_TOKEN`); переменная `PASS` в контракте отсутствует — это пароль БД, его место
в менеджере секретов и интерактивном вводе `supabase link`.

**Альтернативы.** (1) Переименовать контракт под `*_PUBLISHABLE_KEY` / `*_SECRET_KEY` — отвергнуто:
это правка `env-vars.md`, `env.ts`, `api.ts` и промптов D04/D11 ради смены ярлыка, при том что
новый ключ и anon-ключ взаимозаменяемы по роли (`anon`), а `service_role` уже назван в INV-006.
(2) Держать оба набора имён параллельно — отвергнуто: два источника правды для одной пары ключей,
`api.ts` читает только одно имя. (3) Добавить `SUPABASE_JWKS_URL` в контракт «на будущее» —
отвергнуто по §1.7: ни один PRODUCES его не потребляет, а неиспользуемая переменная превращается
в мнимую зависимость.

**Чем подтверждено.** `src/features/auth/api.ts:32` (схема клиента), `src/shared/config/env.ts:35–36`
(схема backend), `OUTPUT/tooling/env-vars.md` §Правила 1–2, `OUTPUT/security/secrets-and-config.md`
§2 и §5 (grep-гейт `sb_secret` → провал), ADR-0005 (JWT проверяется supabase-js; backend авторизует
отчёты `API_TOKEN`), INV-006/INV-007.
