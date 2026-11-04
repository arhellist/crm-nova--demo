# DEC-025 — D12: фронтенд отчётов читает VITE_REPORT_API_URL и публичный read-only токен …

| Поле | Значение |
|------|----------|
| Дата | 2026-11-04 |
| Intake | — |
| Статус | принято |
| ADR | — |
| Заменяет | — |

**Контекст.** D12 требует клиент к `/api/reports/*` с базовым адресом `VITE_REPORT_API_URL`
и заголовком `Authorization` из настроек сборки. `tooling/env-vars.md` перечисляет `API_TOKEN`
(backend, проверка; frontend, запрос), но не задаёт клиентского имени переменной, а `VITE_*`
по правилам файла не может содержать секретов. При этом D11 защищает отчёты Bearer-токеном
и ограничивает их только чтением агрегатов.

**Решение.** D12: фронтенд отчётов читает VITE_REPORT_API_URL и публичный read-only токен VITE_REPORT_API_TOKEN; backend D11 принимает его как Bearer API_TOKEN. Токен публичный по природе (только чтение агрегатов, rate limit), service_role и строка primary в клиент не попадают. Имена VITE_* добавляются в клиентскую схему D12, env-vars.md не меняется этой задачей.

**Альтернативы.** Проксировать отчёты через Supabase Edge Function с серверным `API_TOKEN` —
отвергнуто: новый сервис без ADR и вне PRODUCES. Ходить в `/api/reports/*` без токена —
отвергнуто: нарушает INV-4 D11 и открывает агрегаты периметру. Использовать голый `API_TOKEN`
в `import.meta.env` без префикса `VITE_` — Vite не подставит его в бандл. Принят публичный
read-only токен `VITE_REPORT_API_TOKEN`; он не даёт записи, не раскрывает ПДн и ограничен
rate limit 60/мин.

**Чем подтверждено.** `A12.6` (`src/features/reports/bundle.test.ts`: в клиентском дереве нет
`service_role`, `DATABASE_URL_PRIMARY` и строк `postgresql://`; адрес отчётов — только
`VITE_REPORT_API_URL`), `A12.1` (клиент получает 200 и конверт `source=replica`), D11 `INVARIANTS 4`.
