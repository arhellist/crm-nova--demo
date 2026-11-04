# DEC-013 — D05 переиспользует единственный клиент Supabase из src/features/auth/api.ts: …

| Поле | Значение |
|------|----------|
| Дата | 2026-11-04 |
| Intake | — |
| Статус | принято |
| ADR | — |
| Заменяет | — |

**Контекст.** D05 (HOW п.3) требует, чтобы обёртка PostgREST брала базовый URL и `apikey` из уже
проверенной клиентской конфигурации и не логировала токен. Единственное место чтения `VITE_*`
и создания клиента — `src/features/auth/api.ts` (D04): повторное чтение `import.meta.env`
в другом модуле создало бы второй источник правды, а второй экземпляр клиента — вторую сессию.

**Решение.** D05 переиспользует единственный клиент Supabase из src/features/auth/api.ts: модуль дополнительно экспортирует supabaseUrl и supabaseAnonKey (значения уже валидированы readClientEnv), отдельный клиент и повторное чтение import.meta.env не создаются. Файл src/features/auth/api.ts добавлен в PRODUCES D05; поведение D04 не меняется — повторный review D04 переснимается на новый produces_digest.

**Альтернативы.** (1) Читать `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` прямо в `postgrest.ts` — два источника конфигурации и обход `readClientEnv`; отказ. (2) Создать отдельный клиент в `postgrest.ts` — вторая сессия и второй refresh, рассинхрон токена; отказ. (3) Брать `supabaseUrl`/`supabaseKey` из полей экземпляра supabase-js — непубличный контракт библиотеки, ломается при обновлении; отказ. Принят экспорт уже вычисленных значений из `auth/api.ts` с включением файла в PRODUCES D05.

**Чем подтверждено.** `A05.3`, `A05.6` (`src/features/objects/authz.test.ts`), `A05.4`
(`src/features/objects/api.test.ts`); `npm run lint && npm run typecheck && npm run test` — 28/28;
`sp verify --d D05 --gate pre_ci` = `tax_pass: true`; `sp verify --d D04` переснят на новый
`produces_digest` с тем же поведением входа.
