# Деплой и откат

> Сгенерировано Witness Done v1.31.0. Согласовано с `cicd-and-environments.md` и ADR-0006.

## 1. Предусловия релиза

- [ ] Все D релизного среза `done` с `tax_pass: true`.
- [ ] `sp-verify --gate pre_release` → `tax_pass: true`.
- [ ] `sp-verify --gate product-smoke` → зелёный, runbook `docs/runbooks/product-smoke.md`.
- [ ] `sp doctor --strict` и `sp rules --check` зелёные.
- [ ] Миграции проверены на staging, идемпотентны, forward-only.
- [ ] Секреты production на месте, staging и production не пересекаются.
- [ ] Rollback-план подтверждён (тег образа и предыдущий Vercel-деплой известны).

## 2. Staging

```bash
supabase db push --linked            # миграции staging
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --build
curl -fsS https://staging-api.nova.example/health
curl -fsS https://staging-api.nova.example/health/replication
npx vercel deploy --prebuilt --prod=false --token "$VERCEL_TOKEN"
bash scripts/smoke/wave-api-smoke.sh all
```

Критерий: smoke и wave-скрипт зелёные, журнал релиза обновлён.

## 3. Production

```bash
# 1. Подтверждение через GitHub Environment production (required reviewers)
# 2. Миграции
supabase db push --linked --project-ref "$PROD_PROJECT_REF"
# 3. Backend тем же тегом, что прошёл staging
docker compose -f docker-compose.prod.yml up -d --no-build
# 4. Проверка
curl -fsS https://api.nova.example/health
curl -fsS https://api.nova.example/health/replication
# 5. Frontend
npx vercel deploy --prebuilt --prod --token "$VERCEL_TOKEN"
# 6. Полный smoke по runbook
```

## 4. Откат

| Слой | Действие | Проверка |
|------|----------|----------|
| Frontend | Vercel → Instant Rollback на предыдущий деплой | открыть `/login`, `/objects` |
| Backend | `docker compose up -d` с тегом `sha-<prev>` | `/health` = 200 |
| Схема | forward-fix миграция (не откат) | повторный прогон миграций и pgTAP |
| Данные | PITR по runbook восстановления | сверка счётчиков и выборочная проверка |

Откат фиксируется в журнале релизов: причина, слой, время, кто выполнил, результат smoke.

## 5. Окна и коммуникация

- Релизы — в рабочие часы, кроме критических исправлений.
- При деградации отчётов UI показывает баннер, продукт продолжает работать.
- При недоступности primary — режим «техработы» (баннер + отключение мутаций на клиенте),
  запись не выполняется, данные не теряются.
