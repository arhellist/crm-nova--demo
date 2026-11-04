# Contour / wave smoke — контур 2 приёмки

> Канон Witness Done (правило действует с v1.10). Связан с `verification-tax.md`, `agent-harness.md`, `cicd-environments.md`.  
> Цель: после пачки D проверять **логику контура**, не надеясь только на lint/unit и не гоняя полный продукт на каждый D.

## Когда какой контур

| Момент | Контур | Команда / артефакт |
|--------|--------|---------------------|
| После каждого runtime D | 1 — pre_ci | `sp-verify --d Dxx --gate pre_ci` |
| После последнего D в `split_group` / явного wave-marker | 2 — wave API-smoke | `scripts/smoke/wave-*.sh` (из SEED на шаге 08) |
| L3 money / quotas / ledger | 2+ human | 5–10 ручных кликов **или** wave-скрипт только затронутых ops |
| Шаг 08 | план окружения | `sp-verify --gate runtime-plan` → `OUTPUT/runtime/runtime-plan.json` |
| Шаг 10b (перед Brownfield) | 2/3 — product-smoke | `sp-verify --gate product-smoke` (runbook + скрипт) |
| Шаг 10b / pre_release | 2/3 — исполнение плана | `sp-verify --gate runtime` (up → seed → verify → down) |
| Перед promote | 3 — release | `sp-verify --gate pre_release` + полный `docs/runbooks/product-smoke.md` на staging |

## Wave marker

На шаге 09 в SIZE_BUDGET / overview помечай волны (`split_group`, например `economy-wave`, `analytics-wave`).  
После закрытия группы — **обязателен** wave smoke до начала следующей независимой группы (или до pre_release).

## Что входит в wave API-smoke (без UI)

Типовой каркас (плейсхолдеры подставляются из openapi проекта):

1. Auth / health  
2. Pricing / settings read  
3. Publish → debit  
4. Bid / quota → paid path  
5. Insufficient funds → 4xx, баланс не уходит в минус  
6. Idempotent retry  
7. Vacancy → application → overage (если в scope)  
8. Analytics ingest / overview read (если в scope)  
9. Admin read-only sanity (если в scope)  
10. Cleanup / финальный баланс invariant  

Полный UI e2e — только в product-smoke (контур 3), не в wave.

## Внешние сторы (ClickHouse, очереди, PSP)

| Среда | Допустимо |
|-------|-----------|
| CI / local pre_ci | memory / fixture / testcontainer; логика rollup без живого OLAP |
| Wave на staging | по возможности живой стор контура |
| Release / pre_prod | **обязателен** хотя бы один прогон с живым внешним стором, если фича от него зависит |

Нельзя считать «memory rollup зелёный» = «SQL ClickHouse ок в проде».

## Артефакты шага 08

Сгенерировать из SEED:

- `OUTPUT/docs/runbooks/product-smoke.md` ← `SEED/smoke/product-smoke.md.example`
- `scripts/smoke/wave-api-smoke.sh` (или проектный `wave-<group>.sh`) ← `SEED/smoke/wave-api-smoke.sh.example`
- Ссылки в `OUTPUT/tooling/verify-commands.md` (wave vs full)

## План рантайма

`catalogs/runtime-plan.md` — как из входов прогона получить `OUTPUT/runtime/runtime-plan.json`
и исполнить его. Смоук проверяет сценарий целиком, план — каждую фразу `Axx` с подъёмом
и снятием окружения. Один не заменяет другой: `runtime` доказывает фразы, `product-smoke` —
что продукт живёт как целое.

## Атрибуция: метки `Axx` (правило с v1.22)

Зелёный смоук без меток — это «смоук прошёл», а не «фраза `A01.2` подтверждена». Поэтому:

- каждая проверка в `scripts/smoke/*` помечается номером фразы (`A01.2`, `A07.1`) в выводе или
  в комментарии строки: `assert_eq "$status" 200  # A01.2`;
- `sp-verify --gate product-smoke` собирает метки в `runtime.labels`, пересекает с `acceptance_ids`
  принятых заданий и пишет непокрытые в `runtime.uncovered_acceptance`;
- скрипт без единой метки или без метки хотя бы одной принятой фразы — провал гейта (`DEC-020`);
- `pre_release` при наличии runtime-кода в `PRODUCES` требует акт `product-smoke` с `tax_pass: true`
  (`DEC-021`): контур 3 не пропускается «на потом».

## Запреты

- Подменять wave полным product e2e на каждый D  
- Гонять смоук без меток `Axx` и считать это доказательством  
- Подменять pre_ci «прогоним на staging потом»  
- Wave, который трогает весь продукт «на всякий случай»  
- Пропуск § wave на staging для money/analytics волн  
