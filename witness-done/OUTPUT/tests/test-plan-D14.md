# Test plan — D14 (релиз и приёмка)

| ID | Фраза | Тест | Статус |
|----|-------|------|--------|
| A14.1 | Все 17 сценариев зелёные, ни один не пропущен | `e2e/smoke.spec.ts` | covered |
| A14.2 | Security-гейт без находок | `scripts/release/check-no-secrets.test.sh` | covered |
| A14.3 | README поднимает контур ≤15 минут | `docs/readme.test.md` | covered |
| A14.4 | Деплой и откат ≤15 минут, журнал заполнен | `scripts/release/deploy.test.sh` | covered |

## Ops

| ID | Проверка внешним контуром |
|----|---------------------------|
| A14.1 | `scripts/smoke/product-smoke.sh` на staging (17 сценариев §4) | `e2e/smoke.spec.ts` |
| A14.2 | `scripts/release/check-no-secrets.sh` с `FE_URL` production-сборки | `scripts/release/check-no-secrets.test.sh` |
| A14.4 | `scripts/release/deploy.sh` на staging и `--rollback` на предыдущий тег | `scripts/release/deploy.test.sh` |
