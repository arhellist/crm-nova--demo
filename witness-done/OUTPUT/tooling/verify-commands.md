# Команды верификации

> Сгенерировано Witness Done v1.31.0. Единственный список команд, которые существуют в проекте.
> Если команда здесь есть, она обязана работать; если её нет в проекте — её здесь быть не должно.

## 1. Локальные проверки

| Назначение | Команда | Ожидание |
|------------|---------|----------|
| Линт | `npm run lint` | exit 0, ошибок 0 |
| Запреты (`any`, `console.log`, `eval`) | `npm run lint:guards` | exit 0 |
| Типы | `npm run typecheck` | exit 0 |
| Unit | `npm run test` | все зелёные |
| Unit с покрытием | `npm run test -- --coverage` | покрытие ≥ 80% по новым файлам |
| SQL/RLS/переходы | `supabase test db` | все pgTAP зелёные |
| Backend integration | `npm run test:backend` | 200/400/401/403/429/503 кейсы |
| Read-only гарантия | `npm run test:readonly` | `POST/PUT/PATCH/DELETE` → `405` |
| Репликация (setup) | `npm run test:replication:setup` | публикация и подписка созданы |
| Репликация (сверка) | `npm run test:replication` | счётчики совпадают, лаг ≤ 5 с |
| E2E | `npm run test:e2e` | 8 сценариев зелёные |
| Бандл | `npm run build && npm run size` | ≤ 250 КБ gzip |
| Формат | `npm run format:check` | exit 0 |

## 2. Гейты фабрики

| Гейт | Команда |
|------|---------|
| Приёмка задания | `node witness-done/SEED/sp-tools/sp-verify.mjs --d Dxx --gate pre_ci` |
| Качество пачки D | `node witness-done/SEED/sp-tools/sp-verify.mjs --gate d-prompt-quality --batch N` |
| Связь «фраза ↔ тест» | `node witness-done/SEED/sp-tools/sp-verify.mjs --gate acceptance --d Dxx` |
| Сверка done ↔ акты | `node witness-done/SEED/sp-tools/sp-verify.mjs --gate evidence-sync` |
| Релиз | `node witness-done/SEED/sp-tools/sp-verify.mjs --gate pre_release` |
| План рантайма | `node witness-done/SEED/sp-tools/sp-verify.mjs --gate runtime-plan` |
| Рантайм-прогон | `node witness-done/SEED/sp-tools/sp-verify.mjs --gate runtime` |
| Продуктовый smoke | `node witness-done/SEED/sp-tools/sp-verify.mjs --gate product-smoke` |
| Самоаудит 10b | `node witness-done/SEED/sp-tools/sp-verify.mjs --gate self-audit` |
| Вход и правила | `node witness-done/SEED/sp-tools/sp.mjs doctor --strict` |
| Адаптеры IDE | `node witness-done/SEED/sp-tools/sp.mjs rules --check` |
| Журнал | `node witness-done/SEED/sp-tools/sp.mjs journal --check --strict` |

## 3. Smoke-контуры

| Контур | Команда | Когда |
|--------|---------|-------|
| Wave API-smoke | `bash scripts/smoke/wave-api-smoke.sh all` | после каждого `split_group`, на staging |
| Wave по группе | `bash scripts/smoke/wave-api-smoke.sh <group>` | когда затронут один контур |
| Product-smoke | `bash scripts/smoke/product-smoke.sh` + runbook | перед production |

Полный чеклист продукта — `docs/runbooks/product-smoke.md`.

## 4. Порядок

```text
lint → lint:guards → typecheck → test → supabase test db → test:backend → test:readonly →
test:replication → test:e2e → build + size → sp-verify --d Dxx --gate pre_ci
```

Первые три шага быстрые и дешёвые: они отсекают ошибки до запуска тестов и БД.
