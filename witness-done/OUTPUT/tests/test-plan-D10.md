# Test plan — D10 (контур реплики и отчётные вьюхи)

| ID | Фраза | Тест | Статус |
|----|-------|------|--------|
| A10.1 | `docker compose up -d` идемпотентен: replica healthy, api стартует | `infra/replica/compose.test.mjs` | covered |
| A10.2 | Подписка streaming, лаг ≤5 с, exit 0 | `infra/replica/check.test.mjs` (разбор `pg_stat_subscription`), `supabase/tests/views_test.sql` | covered |
| A10.3 | Счётчики и метки четырёх таблиц совпадают с primary | `infra/replica/check.test.mjs` (`compareStats`), `supabase/tests/views_test.sql` | covered |
| A10.4 | `insert` от `nova_ro` → `25006`, строка не создана | `infra/replica/check.test.mjs` (`assertReadOnly`) | covered |

Проверка в живом контуре: `node infra/replica/check.mjs` с env `PRIMARY_DATABASE_URL`,
`REPLICA_DATABASE_URL`, `NOVA_RO_URL`; exit 0 — контур синхронен, 1 — расхождение/лаг/запись,
2 — неполная конфигурация. pgTAP вьюх запускается на подписчике:
`psql "$REPLICA_DATABASE_URL" -f supabase/tests/views_test.sql`.
