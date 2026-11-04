# Feedback — оценка готовности прогона

> Сгенерировано Witness Done v1.31.0 (PIPELINE/10). Назначение: честная обратная связь до старта кода.
> Не заменяет `10_consistency_report.md`.

## Вердикт одной строкой

`READY_WITH_DEFAULTS` — комплект спецификаций, промптов, планов проверок и tooling готов к D01;
код продукта не написан, поэтому приёмочные гейты (`acceptance`, `product-smoke`) пока красные
по определению, а не из-за дыр в спецификации.

## 1. Готовность к разработке

| Вопрос | Ответ | Комментарий |
|--------|-------|-------------|
| Можно начинать D01? | да | PRE-CHECK D01 выполним на чистом клоне |
| Все BLOCKER consistency закрыты? | да | `10_consistency_report.md`: BLOCKER = 0 |
| CONFLICTS blockers = 0? | да | `07_conflicts.md` — все закрыты или неприменимы |
| CI/CD и окружения задокументированы? | да | `tooling/cicd-and-environments.md`, `deploy.md` |
| Типизация + автотесты вшиты в rules/D? | да | `catalogs/typing-and-tests.md` в ОГРАНИЧЕНИЯХ каждого D |
| VerificationTax + FIT_CHECKS в D? | да | 14 из 14 промптов |
| harness.md + verify-commands.md? | да | `tooling/harness.md`, `tooling/verify-commands.md` |
| Context packs для runtime D? | да | P01–P14, все `validation.ok = true` |
| Все D в SIZE_BUDGET (`size_ok`)? | да | OVER_BUDGET = 0 |
| Дизайн | present и учтён | `design-notes.md` в CONSUMES пяти UI-D |

## 2. Полнота комплекта

| Артефакт | Статус | Достаточно для разработки? |
|----------|--------|----------------------------|
| analysis / architecture / ADR | ok | да: цели, KPI, 7 ADR, C4 |
| data-model / openapi / domain-rules | ok | да: DDL, матрица переходов, контракты отчётов |
| security/* | ok | да: 22 угрозы, RBAC-матрица, ASVS L2 |
| 07_module_plan + conflicts + gaps | ok | да: 4 include/adapt, 8 skip, 0 блокеров |
| tooling | ok | да: lint, CI на 12 джоб, env, deploy, harness |
| context index + packs | ok | да: 14 паков с must-hit |
| coverage-matrix | ok | P0 missing = 0 |
| d-cut-list + SIZE_BUDGET | ok | 14 D, 0 OVER |
| progress.md | ok | 14 строк, все `not_started` |
| D-prompts | ok | 84 фразы приёмки, 3 батча прошли `d-prompt-quality` |
| test-plans | ok | 14 планов, согласованы с фразами |
| exit-criteria | ok | E1–E28 с ожидаемым доказательством |
| runtime-plan | ok | `--gate runtime-plan` → `tax_pass: true` |

## 3. Что осталось до релиза (не «потом», а обязательное)

1. Выполнить D01–D14 по промптам: только так появятся тесты, объявляющие `Axx.k`.
2. После D01–D14: `sp-verify --gate acceptance` должен стать зелёным; сейчас красный,
   потому что тестов ещё нет (это не отсрочка — это состояние до кода).
3. `sp-verify --gate product-smoke` требует поднятого staging и `FE_URL`/`API_URL`;
   без них скрипт осознанно возвращает код 2 и не выдаёт акт.
4. Только после трёх зелёных гейтов (`acceptance`, `product-smoke`, `self-audit`) —
   переход в Brownfield (`spec-state/`).

## 4. Вопросы на уточнение (actionable)

| # | Вопрос | Файл / D | Почему важно | Значение по умолчанию |
|---|--------|----------|--------------|------------------------|
| 1 | Реальный домен staging и production | `tooling/cicd-and-environments.md`, D14 | нужен для CSP, CORS и e2e | `*.nova.example` |
| 2 | Кто владелец `API_TOKEN` и как ротируется | `security/secrets-and-config.md`, D11 | без владельца токен живёт вечно | ротация вручную по runbook |
| 3 | Правовая оценка 152-ФЗ при размещении ПДн в ЕС | `01_analysis.md#Риски` | влияет на выбор региона | принять риск, зафиксировано |
| 4 | Нужен ли второй менеджер в seed | D02 | влияет на e2e-матрицу ролей | один менеджер, как в ТЗ |
| 5 | Точные SLA Supabase-плана | `nfr.md` NFR6 | обоснование 99.9% | допущение из ТЗ |

## 5. Рекомендуемые следующие шаги

1. `npm install` и `supabase start` — проверить окружение до D01.
2. Ответить на вопросы 1–2 (остальные не блокируют).
3. Запустить D01 строго по промпту и `sp-verify --d D01 --gate pre_ci`.
4. Не переходить к D02, пока D01 не `done` с актом.
5. Ретроспектива после S4 (D06) — проверить, что оценка бюджета промптов совпала с фактом.
