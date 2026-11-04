# DEC-001 — Раскладка: проект — корень TestCRM, канон — TestCRM/witness-done/. Код продук…

| Поле | Значение |
|------|----------|
| Дата | 2026-11-04 |
| Intake | 20261104-1743-razvernut-kanon-kak-project-witness-done |
| Статус | принято |
| ADR | — |
| Заменяет | — |

**Контекст.** Репозиторий был склонирован как сам канон Witness Done: `ORCHESTRATOR.md`, `PIPELINE/`, `SEED/` лежали в корне `/home/alex/Документы/MyProjects/TestCRM`. `sp status` при этом определял PROJECT_ROOT = корень и искал `witness-done/OUTPUT` и `witness-done/INPUT`, то есть фабрика не видела собственных артефактов, а правило канона «в корне канона префикса нет» конфликтовало с правилом проекта «OUTPUT и INPUT внутри witness-done». Ограничения: журнал проекта (`journal/`) должен коммититься в корне проекта, `ORCHESTRATOR.md` обязан существовать ровно в одном месте, код продукта не может жить внутри папки канона.

**Решение.** Раскладка: проект — корень TestCRM, канон — TestCRM/witness-done/. Код продукта живёт в корне, INPUT/OUTPUT — внутри witness-done, spec-state и journal — в корне проекта. Причина: канон требует witness-done/INPUT для ТЗ и witness-done/OUTPUT для артефактов; корень канона не может быть проектом.

**Альтернативы.** (1) Оставить канон в корне и считать его проектом — отвергнуто: `INPUT/TECH_SPEC.md` и `OUTPUT/` канона смешались бы с кодом продукта, `validate.sh` начал бы проверять продукт, а `sp status` не нашёл бы OUTPUT. (2) Вынести канон в соседний репозиторий и подключить как зависимость — отвергнуто: нарушает переносимость одного клона и усложняет передачу проекта. (3) Вложить канон в `witness-done/` и оставить проект в корне — принято.

**Чем подтверждено.** `node witness-done/SEED/sp-tools/sp.mjs status` печатает `PROJECT_ROOT` = корень проекта и `FACTORY` = `<root>/witness-done`; `sp rules --check` синхронизирует 13 адаптеров в корне; артефакты шагов 00–08 лежат в `witness-done/OUTPUT/` и читаются гейтами (`sp-verify --gate runtime-plan`, `--gate self-audit`). `ORCHESTRATOR.md` существует только в `witness-done/`.
