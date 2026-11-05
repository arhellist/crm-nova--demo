# Test plan — D13 (наблюдаемость и восстановление)

| ID | Фраза | Тест | Статус |
|----|-------|------|--------|
| A13.1 | `/metrics` содержит нужные серии | `observability/rules.test.mjs` | covered |
| A13.2 | Правило валидно и срабатывает | `observability/rules.test.mjs` | covered |
| A13.3 | Восстановление из PITR, RTO/RPO записаны | `scripts/ops/backup-check.test.sh` | covered |
| A13.4 | Инцидент-симуляция по runbook и таймстампы (`docs/runbooks/incident.drill.md`) | `observability/rules.test.mjs` | covered |

## Ops

| ID | Проверка внешним контуром |
|----|---------------------------|
| A13.1 | `scripts/smoke/wave-api-smoke.sh release` | `observability/rules.test.mjs` |
| A13.3 | `scripts/smoke/wave-api-smoke.sh release` | `scripts/ops/backup-check.test.sh` |
