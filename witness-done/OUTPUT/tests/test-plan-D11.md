# Test plan — D11 (API отчётов)

| ID | Фраза | Тест | Статус |
|----|-------|------|--------|
| A11.1 | Отчёт с `source=replica` и лагом | `src/reporting/routes/reports.test.ts` | covered |
| A11.2 | 401 / 403 / 405 на неверные запросы | `src/reporting/routes/reports.test.ts` | covered |
| A11.3 | Лаг 40 с → `lagging` | `src/reporting/routes/health.test.ts` | covered |
| A11.4 | Агрегаты совпадают с primary | `src/reporting/aggregates.test.ts` | covered |
| A11.5 | В ответах нет ПДн и комментариев | `src/reporting/routes/reports.test.ts` | covered |
| A11.6 | Реплика остановлена → 503, `/health` 200 | `src/reporting/routes/health.test.ts` | covered |
| A11.7 | В процессе нет строки подключения к primary | `src/reporting/config.test.ts` | covered |

## Ops

| ID | Проверка внешним контуром |
|----|---------------------------|
| A11.1 | `scripts/smoke/wave-api-smoke.sh reports` | `src/reporting/routes/reports.test.ts` |
| A11.3 | `scripts/smoke/wave-api-smoke.sh reports` | `src/reporting/routes/health.test.ts` |
| A11.6 | `scripts/smoke/wave-api-smoke.sh reports` | `src/reporting/routes/health.test.ts` |
