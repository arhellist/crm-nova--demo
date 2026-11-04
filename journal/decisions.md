# Журнал решений проекта NOVA CRM

> Append-only: принятое не редактируется, `DEC-###` не переиспользуются.
> Одна запись — один файл в `decisions/`; этот файл собирается командой `sp journal --index`.
> Канон: `catalogs/intake-and-decisions.md`.

Журнал **коммитится**: `journal/` — источник правды о том, почему сделано именно так. Решения,
оставшиеся только на машине автора, для проекта не существуют.

## Оглавление

| ID | Решение | Дата | Статус | Intake |
|----|---------|------|--------|--------|
| DEC-001 | Раскладка: проект — корень TestCRM, канон — TestCRM/witness-done/. Код продук… | 2026-11-04 | принято | 20261104-1743-razvernut-kanon-kak-project-witness-done |
| DEC-002 | Гейт канона в проекте: `./validate.sh` внутри работающей установки падает … | 2026-11-04 | принято | 20261104-1743-razvernut-kanon-kak-project-witness-done |
| DEC-003 | Результаты 10b переснимаются каноном 1.31.1 из MyProjects/WitnessDone; копия … | 2026-11-04 | принято | 20261104-2050-horosho-patch-etot-rep-no-ne-fabriku-a-e |
| DEC-004 | Инструментовка шага 08 (.eslintrc.js, .github/workflows/ci.yml, .gitignore, e… | 2026-11-04 | принято | 20261104-2050-horosho-patch-etot-rep-no-ne-fabriku-a-e |
