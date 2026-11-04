# Test plan — D10 (реплика и вьюхи)

| ID | Фраза | Тест | Статус |
|----|-------|------|--------|
| A10.1 | `docker compose up -d` идемпотентен | `infra/replica/compose.test.mjs` | covered |
| A10.2 | Подписка streaming, лаг ≤5 с | `supabase/tests/views_test.sql` | covered |
| A10.3 | Счётчики и `max(updated_at)` совпадают | `supabase/tests/views_test.sql` | covered |
| A10.4 | `nova_ro` не пишет (`25006`) | `infra/replica/check.test.mjs` | covered |

## Ops

| ID | Проверка внешним контуром |
|----|---------------------------|
| A10.2 | `scripts/smoke/wave-api-smoke.sh reports` |
| A10.3 | `scripts/smoke/wave-api-smoke.sh reports` |
