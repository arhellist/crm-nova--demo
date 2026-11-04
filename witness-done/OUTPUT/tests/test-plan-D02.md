# Test plan — D02 (схема и RLS)

| ID | Фраза | Тест | Статус |
|----|-------|------|--------|
| A02.1 | `current_role()` возвращает роль из `profiles` | `supabase/tests/schema_test.sql` | covered |
| A02.2 | Исполнитель видит только свои задачи | `supabase/tests/rls_test.sql` | covered |
| A02.3 | Прямой `update` чужой задачи → 0 строк | `supabase/tests/rls_test.sql` | covered |
| A02.4 | Seed: 3 объекта, ≥8 задач, все пять статусов | `supabase/tests/schema_test.sql` | covered |
| A02.5 | `anon` без доступа к таблицам и функциям | `supabase/tests/rls_test.sql` | covered |
| A02.6 | `delete` задачи запрещён | `supabase/tests/rls_test.sql` | covered |

## Ops

| ID | Проверка внешним контуром |
|----|---------------------------|
| A02.2 | `scripts/smoke/wave-api-smoke.sh schema` |
| A02.4 | `scripts/smoke/wave-api-smoke.sh schema` |
