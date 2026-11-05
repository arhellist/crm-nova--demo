# Test plan — D12 (экран отчётов)

| ID | Фраза | Тест | Статус |
|----|-------|------|--------|
| A12.1 | Три отчёта и бейдж актуальности | `src/features/reports/ReportsPage.test.tsx` | covered |
| A12.2 | Исполнителю 404, пункта навигации нет | `src/features/reports/ReportsPage.test.tsx` | covered |
| A12.3 | Лаг 40 с → предупреждение, данные видны | `src/features/reports/ReportsPage.test.tsx` | covered |
| A12.4 | 503 → панель деградации, навигация работает | `src/features/reports/degraded.test.tsx` | covered |
| A12.5 | Лишнее поле `email` не отображается | `src/features/reports/degraded.test.tsx` | covered |
| A12.6 | В `dist/` нет primary и `service_role` | `src/features/reports/bundle.test.ts` | covered |

## Ops

| ID | Проверка внешним контуром |
|----|---------------------------|
| A12.1 | `scripts/smoke/wave-api-smoke.sh reports` | `src/features/reports/ReportsPage.test.tsx` |
| A12.4 | `scripts/smoke/wave-api-smoke.sh reports` | `src/features/reports/degraded.test.tsx` |
