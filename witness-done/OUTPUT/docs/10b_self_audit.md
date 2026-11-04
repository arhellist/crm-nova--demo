# Self-audit 10b — аудит комплекта NOVA CRM

> Дата: 2026-11-04. Комплект собран каноном 1.31.0; гейты 10b пересняты каноном **1.31.1**
> (DEC-003): копия фабрики в `witness-done/` не обновлялась по распоряжению владельца.
> Машинный результат: `10b_self_audit.machine.json`. Аудит по артефактам, не по мнению.

## Вердикт

`SELF_AUDIT: PASS` — комплект пригоден к исполнению: 14 заданий с полными телами и планами
проверок, покрытие 100 % в обе стороны, критерии завершения проверяемы, трассировка запрос →
решение → артефакт замкнута. Гейты, у которых на 10b нет предмета проверки, вернули явный
`deferred`/`na`, а не «зелено» (см. §«Отложено»).

`PASS` здесь означает ровно это: **комплект готов к работе**, а не «продукт готов». Критериев
завершения закрыто 0 из 28 (`open_criteria: 28`) — они закрываются по мере выполнения D01…D14,
и число открытых записано в акт, чтобы `PASS` не читался как «всё доказано».

Первоначальный `FAIL` был не дефектом комплекта, а дефектом канона 1.31.0: он требовал на 10b
гейты `acceptance`, `product-smoke`, `runtime` и ось «Базовая линия», предмет которых появляется
только после D01…D14 или на R01. Разбор — `docs/AUDIT-witnessdone-1.31.0.md` (C-01…C-04), фикс —
канон 1.31.1 (DEC-041 канона).

## Автоматические гейты

Снято CLI канона 1.31.1: `node ../WitnessDone/SEED/sp-tools/sp-verify.mjs --root . --factory witness-done`.

| Гейт | Команда | Результат | Доказательство |
|------|---------|-----------|----------------|
| Качество D, батч 1 | `sp-verify --gate d-prompt-quality --batch 1` | pass, failed = [] (D01–D05) | `evidence/prompt-quality-batch-1.json` |
| Качество D, батч 2 | `sp-verify --gate d-prompt-quality --batch 2` | pass, failed = [] (D06–D10) | `evidence/prompt-quality-batch-2.json` |
| Качество D, батч 3 | `sp-verify --gate d-prompt-quality --batch 3` | pass, failed = [] (D11–D14) | `evidence/prompt-quality-batch-3.json` |
| Самоаудит комплекта | `sp-verify --gate self-audit` | pass, `issues: []`, `prompts_checked: 14`, `open_criteria: 28` | `evidence/SELF_AUDIT.json` |
| Связь фраз и тестов | `sp-verify --gate acceptance` | pass, `scope: deferred`, отложено 14/14 (ни одно D не `done`) | `evidence/ACCEPTANCE.json` |
| Продуктовый smoke | `sp-verify --gate product-smoke --na "…"` | pass, `na: true` + причина | `evidence/RELEASE-product-smoke.json` |
| План рантайма (статика) | `sp-verify --gate runtime-plan --skip-commands` | pass, `uncovered: []`, `accepted_count: 0`, `coverage_scope: no accepted D` | `evidence/RELEASE-runtime-plan.json` |
| Рантайм-верификация | `sp-verify --gate runtime` | **не требуется на 10b** (1.31.1) | — |
| Базовая линия | `sp-verify --gate baseline` | **не вход 10b** (1.31.1): проверяется на R01 | — |
| Правила IDE | `sp rules --check` | pass, 13 целей синхронны | вывод CLI |
| Прогресс | `sp progress --check` | exit 0, «фрагментов нет — сверять нечего» (одиночный режим) | вывод CLI |
| Doctor strict | `sp doctor --strict` | pass (`doctor: ok (strict)`) | вывод CLI |

Акты, снятые при расследовании канона и намеренно красные (`BASELINE`, `pre_release`,
`acceptance --d D01` на невыполненном задании), вынесены из `evidence/` в
`docs/audit-probes-1.31.0/` — иначе `pre_release` принял бы пробу за провал шага.

## Аудит по осям

| Ось | Результат | Доказательство | Комментарий |
|-----|-----------|----------------|-------------|
| Доказательства (акты D) | n/a (отложено) | `roadmaps/progress.md` | ни одно D не `done`, актов `Dxx.json` нет по определению; `--verify-evidence` проверять нечего |
| Качество заданий | pass | 3 акта `prompt-quality-batch-*.json`, `SELF_AUDIT.json` | HOW, INVARIANTS 5–12, ACCEPTANCE с Given/When/Then, SIZE_BUDGET, PRODUCES ≤6, CONTEXT_PACK с `*.validation.json`; `prompts_checked: 14` |
| Планы проверок | n/a (отложено) | `tests/test-plan-D01…D14.md`, `tests/INDEX.md` | 14 планов, 104 строки «фраза → тест» на 82 уникальные фразы; тестов нет, потому что нет кода — проверяется у `done`-заданий |
| Критерии завершения | pass (формально, 28 открыто) | `docs/exit-criteria.md` | E1–E28, у каждого способ проверки и файл-доказательство; `pass` без существующего файла валит гейт; закрыто 0 |
| Покрытие | pass | `roadmaps/coverage-matrix.md` | 0 строк без D, 0 фантомных D (обратная сверка с `OUTPUT/prompts/`), P0 missing = 0 |
| Риски | pass | `docs/01_analysis.md#Риски` | 5 рисков, у каждого владелец-роль и компенсация |
| Размер заданий | pass | `roadmaps/d-cut-list.md` | 14 D, OVER = 0, surfaces ≤ 2 |
| Трассируемость | pass | `journal/`, `sp doctor --strict` | DEC-001…DEC-004 заполнены и связаны с intake; `doctor --strict` = ok, правила IDE синхронны |
| Базовая линия | n/a (не вход 10b) | — | создаётся и проверяется на `R01_baseline_specs` (DEC-041 канона) |

## Отложено (deferred)

`n/a` в этом отчёте стоит только там, где есть акт с причиной — по правилу канона.

| Что не проверено | Почему | Чем закроется | Акт / артефакт |
|------------------|--------|---------------|----------------|
| Связь «фраза ↔ тест» для всех заданий | тестов нет: D01–D14 не выполнены | `--gate acceptance --require-all` (полная проверка) | `evidence/ACCEPTANCE.json`, `scope: deferred` |
| Продуктовый smoke на staging | нет ни кода, ни контура | `--gate product-smoke` с `FE_URL`/`API_URL`/`TOKEN` | `evidence/RELEASE-product-smoke.json`, `na: true` |
| Рантайм-верификация (`--gate runtime`) | нет стека; на 10b не требуется | `--gate runtime` на `pre_release` | план: `runtime/runtime-plan.json` |
| Покрытие приёмки рантайм-планом | `accepted_count: 0` — принятых фраз нет | тот же гейт после первых `done` | `evidence/RELEASE-runtime-plan.json`, `coverage_scope` |
| Базовая линия | `spec-state/` создаётся на R01 | `--gate baseline` на R01 | — |
| Акты `Dxx.json` и `Dxx.review.json` | задания не выполнялись | гейты `pre_ci` / `sp review` по каждому D | — |
| Сверка `progress.d/` | фрагментов нет (разработка не начата) | `sp progress --check` после D01 | вывод CLI |

## Провалы

Провалов комплекта нет: все гейты, у которых есть предмет проверки, зелёные.

| # | Что было провалом | Severity | Причина | Статус |
|---|-------------------|----------|---------|--------|
| 1 | `--gate acceptance` = fail | BLOCKER (канон) | требовал тестов до появления кода (C-01) | закрыт: 1.31.1 отдаёт `scope: deferred` |
| 2 | `--gate product-smoke` = fail (exit 2) | BLOCKER (канон) | не было способа записать честный отказ (C-02, C-12) | закрыт: введён `--na "<причина>"` |
| 3 | `--gate runtime` требовался на 10b | BLOCKER (канон) | поднимать нечего (C-03) | закрыт: 1.31.1 не требует `runtime` на 10b |
| 4 | Ось «Базовая линия» = n/a | BLOCKER (канон) | цикл `spec-state/` ↔ `R01` (C-04) | закрыт: ось убрана из 10b |
| 5 | `self-audit` = pass при `acceptance` = fail | MAJOR | гейт не проверял промпты и приёмку (C-05) | закрыт: `self-audit` вызывает проверку заданий, пишет `prompts_checked`, `open_criteria` |
| 6 | `runtime-plan` pass при `accepted_count = 0` | MAJOR | полнота по пустому множеству (C-06) | закрыт: акт пишет `accepted_count` и `coverage_scope` |
| 7 | `sp doctor --strict` = fail | MAJOR | файлы канона считались кодом вне PRODUCES (C-14) | закрыт: `witness-done/` в `BOOKKEEPING_PREFIXES` |
| 8 | Инструментовка шага 08 вне git | MINOR (проект) | проект жил незакоммиченным рабочим деревом канона | закрыт: коммит `a2c68a1`, ветка `nova-crm` (DEC-004) |

## Остаточные ограничения

1. **Копия фабрики в проекте — 1.31.0.** Гейты 10b пересняты каноном 1.31.1 из
   `MyProjects/WitnessDone` (DEC-003); `witness-done/` по распоряжению владельца не обновлялся.
   Поэтому `./validate.sh` в проекте не запускался и запускать его здесь не следует: это гейт
   репозитория канона (DEC-002). При следующем `sp update` копия догонит 1.31.1.
2. **`--skip-commands` в `product-smoke` по-прежнему даёт зелёный акт без прогона** (C-12 не
   закрыт в 1.31.1). В этом прогоне он не используется: применён `--na` с причиной, а реальный
   прогон остаётся обязательным на `pre_release`.
3. **`open_criteria: 28`.** Все критерии E1–E28 открыты по определению: продукта ещё нет.

## Порядок работ дальше

1. `PIPELINE/R01_baseline_specs.md` — базовая линия (`spec-state/`), затем `--gate baseline`.
2. D01 → … → D14 строго по `OUTPUT/prompts/Dxx_*.md` и `context/packs/Pxx.md`; каждый — `pre_ci`,
   `sp review` для L2/L3 и акт `evidence/Dxx.json`.
3. После D03: `sp-verify --gate acceptance --require-all` — убедиться, что связка «фраза ↔ тест»
   работает на принятых заданиях.
4. После D14: `--gate product-smoke` на staging, `--gate runtime`, `--gate pre_release`.

```text
SELF_AUDIT: PASS
DEFERRED: acceptance (scope: deferred, тестов нет до D01…D14) → --require-all на pre_release;
          product-smoke (na: true, контура нет) → prerelease-прогон;
          runtime (не требуется на 10b) → pre_release;
          baseline (не вход 10b) → R01
DOCTOR: PASS (strict)
RULES: PASS (13 целей)
OPEN_CRITERIA: 28
Следующий шаг: PIPELINE/R01_baseline_specs.md
```
