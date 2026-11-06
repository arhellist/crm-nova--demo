# Журнал прогона — NOVA CRM

> Хронология шагов фабрики. Технические статусы — в `OUTPUT/MANIFEST.md`, решения — в
> `journal/decisions/`. Этот файл фиксирует «что произошло и чем закончилось».

| Шаг | Дата | Что сделано | Итог |
|-----|------|-------------|------|
| установка | 2026-11-04 | Канон перенесён в `witness-done/`, проект — корень репозитория (DEC-001). Целостность канона: `git archive HEAD` → `./validate.sh` → PASS; в работающей установке `validate.sh` падает по определению (OUTPUT занят) — гейт канона, а не прогона (DEC-002) | ok |
| 00 | 2026-11-04 | `OUTPUT/MANIFEST.md` (MODE greenfield, профиль web-app), каталоги OUTPUT, `journal/` из заготовки, `AGENTS.md` с протоколом входа, 13 адаптеров IDE, pre-commit | done |
| 01 | 2026-11-04 | Анализ ТЗ: бизнес-цели и KPI, акторы, IN/OUT/LATER (без «later»), 17 сценариев P0, черновые срезы S0…S10, 6 гипотез с defaults | done |
| 02 | 2026-11-04 | Конституция: `AGENTS.md` с INV-001…INV-011, `design-notes.md` из `Design.html`, DoD, `sp rules --sync` (13 целей) | done |
| 03 | 2026-11-04 | Архитектура: C4-контейнеры, 3 sequence-потока, ADR-0001…0007 (Fastify, единственный путь записи, реплика, React/Vite, auth+MFA, окружения, spec-state) | done |
| 04 | 2026-11-04 | Данные и API: DDL 4 таблиц, ERD, матрица переходов, сигнатуры RPC, OpenAPI 3.1 (health, replication, metrics, три отчёта), чеклист контрактов | done |
| 05 | 2026-11-04 | Безопасность: STRIDE T01–T22, RBAC SEC-01…SEC-12, ASVS L2, секреты и защита данных | done |
| 06 | 2026-11-04 | NFR1–NFR22 с числом, способом проверки и владельцем; capacity-notes; work items | done |
| 07 | 2026-11-04 | Модули: include `logging-pino`, `rate-limiting`; adapt `auth-jwt`, `crud-table`; 8 skip; конфликты закрыты, blocker = 0 | done |
| 08 | 2026-11-04 | Tooling: `.eslintrc.js` + локальные правила, CI на 12 джоб, 14 документов tooling, wave-smoke и runbook, `runtime-plan.json` | done |
| 09 | 2026-11-04 | C1: d-cut-list (14 D, OVER=0), overview, граф, progress, coverage (missing=0), context index. C2: 14 D-промптов + P01…P14, три батча `d-prompt-quality` = pass. C3: 14 тест-планов, INDEX, improvement-backlog | done |
| 10 | 2026-11-04 | Сборка: consistency report (BLOCKER=0), START_HERE, exit-criteria E1–E28, feedback, handoff, improvements, product-smoke скрипт | done |
| 10b | 2026-11-04 | C4: `d-prompt-quality` 3/3 pass, `self-audit` pass (`open_criteria: 28`, `prompts_checked: 14`), `acceptance` = `scope: deferred`, `product-smoke` = `na: true` с причиной, `runtime-plan` = pass (`accepted_count: 0`), `doctor --strict` = ok, `rules --check` = 13/13 | done |
| аудит | 2026-11-04 | Проверка канона 1.31.0: 4 блокера 10b, 7 ложных зелёных, 4 инструментальных дефекта; воспроизведение selftest `validate.sh` на двух копиях | отчёт `docs/AUDIT-witnessdone-1.31.0.md` |
| патч канона | 2026-11-04 | Канон исправлен в `MyProjects/WitnessDone` → 1.31.1 (`DEC-041`): `acceptance` отдаёт `deferred`, у `product-smoke` появился `--na`, `runtime` и `baseline` сняты с 10b, `self-audit` проверяет задания и файлы-доказательства, `doctor` не считает канон кодом вне PRODUCES | тег `v1.31.1` |
| пересъёмка 10b | 2026-11-04 | Результаты пересняты каноном 1.31.1 (DEC-003): отчёт и машинный акт переписаны на PASS, акты гейтов обновлены, `MANIFEST` → `last_completed_step: 10b`, `10b_self_audit: done`; инструментовка шага 08 внесена в git (DEC-004) | done |

## Итог волн

| Волна | Шаги | Результат |
|-------|------|-----------|
| A | 00–04 | done |
| B | 05–08 | done |
| C | 09–10b | C1–C4 выполнены; 10b — PASS (гейты пересняты каноном 1.31.1) |

## Видимые gaps входа (шаг 00)

Зафиксированы без решения, закрываются шагами 01–09: уровень OWASP привязан к ASVS L2, но не к
тестам; порог лага репликации и поведение при разрыве подписки; границы «дизайн → токены»;
DDL и контракт отчётных вьюх; регламент провижининга как артефакт; место `spec-state/`;
перечень `INV-###`.

## Brownfield

| Шаг | Дата | Что сделано | Статус |
|-----|------|-------------|--------|
| R01 | 2026-11-04 | Инициализирован `spec-state/`: `config.yaml`, 5 доменов (auth, objects, tasks, reporting, platform), 26 требований MUST/SHALL с 52 сценариями (happy + negative/boundary); `--gate baseline` = pass | done |
| post-D14 | 2026-11-05 | Закрыты exit-criteria E1–E28 → `pass` по актам D01–D14 (DEC-040); R02 не стартован без бизнес-запроса | done |
| R02/R03 | 2026-11-06 | change `ui-spacing-density`: PostCSS+Tailwind в SPA, локальные шрифты; CSS 1 КБ → 43 КБ с утилитами (DEC-045) | done |
