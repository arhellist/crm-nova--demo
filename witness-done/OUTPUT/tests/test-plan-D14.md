# Test plan — D14 (релиз и приёмка)

| ID | Фраза | Тест | Статус |
|----|-------|------|--------|
| A14.1 | 17 сценариев §4 зелёные, без skip | `e2e/smoke.spec.ts` | covered |
| A14.2 | Security-гейты без находок | `scripts/release/check-no-secrets.test.sh` | covered |
| A14.3 | README поднимает контур ≤15 мин | `docs/readme.test.md` | covered |
| A14.4 | Деплой и откат ≤15 мин, журнал заполнен | `scripts/release/deploy.test.sh` | covered |

## Ops

| ID | Проверка внешним контуром |
|----|---------------------------|
| A14.1 | `scripts/smoke/product-smoke.sh` |
| A14.2 | `scripts/smoke/product-smoke.sh` |
| A14.4 | `scripts/smoke/product-smoke.sh` |
