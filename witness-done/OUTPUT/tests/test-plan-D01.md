# Test plan — D01 (platform skeleton)

> Фразы ACCEPTANCE ↔ файлы тестов из PRODUCES. Статус `covered` = кейс реализуется этим заданием.

| ID | Фраза | Тест | Статус |
|----|-------|------|--------|
| A01.1 | Нет `SUPABASE_URL` → процесс падает, значение не печатается | `src/shared/config/env.test.ts` | covered |
| A01.2 | `GET /health` → 200 по схеме, версия из `package.json` | `src/server/app.test.ts` | covered |
| A01.3 | `authorization` не попадает в лог | `src/shared/logger.test.ts` | covered |
| A01.4 | 61-й запрос за минуту → 429 и `retry-after` | `src/server/app.test.ts` | covered |
| A01.5 | `SIGTERM` → выход 0 не дольше 5 с | `src/server/lifecycle.test.ts` | covered |
| A01.6 | `x-request-id` попадает во все строки лога запроса | `src/server/app.test.ts` | covered |

## Ops

| ID | Проверка внешним контуром |
|----|---------------------------|
| A01.2 | `scripts/smoke/wave-api-smoke.sh platform` | `GET /health` → 200 по схеме, версия из `package.json` |
| A01.4 | `scripts/smoke/wave-api-smoke.sh platform` | `src/server/app.test.ts` |
