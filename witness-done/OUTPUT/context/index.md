# Context Index

> Создан на шаге 09 (C1). Обновляется при `sp-retrieve --reindex`.
> Индекс — оглавление для retrieve/validate, не дамп содержимого.

## Chunks (источники, общие для всех паков)

| chunk_id | path | якорь / заголовок | tags | module |
|----------|------|-------------------|------|--------|
| c001 | `OUTPUT/specs/data-model.md` | §3.1 `profiles` | db, rls | schema |
| c002 | `OUTPUT/specs/data-model.md` | §3.2 `objects` | db, rls | objects |
| c003 | `OUTPUT/specs/data-model.md` | §3.3 `tasks` | db, rls | tasks |
| c004 | `OUTPUT/specs/data-model.md` | §3.4 `task_status_history` | db, history | schema |
| c005 | `OUTPUT/specs/data-model.md` | §4.1 `rpc.change_task_status` | db, rpc | schema |
| c006 | `OUTPUT/specs/data-model.md` | §4.2 Триггеры | db, trigger | schema |
| c007 | `OUTPUT/specs/data-model.md` | §5 Права и RLS | security, rls | schema |
| c008 | `OUTPUT/specs/domain-rules.md` | матрица переходов | domain | tasks |
| c009 | `OUTPUT/specs/openapi.yaml` | path `/objects` | api | objects |
| c010 | `OUTPUT/specs/openapi.yaml` | path `/tasks` | api | tasks |
| c011 | `OUTPUT/specs/openapi.yaml` | path `/reports/*` | api | reports |
| c012 | `OUTPUT/security/authn-authz.md` | §RBAC-матрица | security | auth |
| c013 | `OUTPUT/security/threat-model.md` | T01–T22 | security | all |
| c014 | `OUTPUT/docs/nfr.md` | NFR1–NFR22 | nfr | all |
| c015 | `OUTPUT/docs/design-notes.md` | токены и компоненты | ui, design | ui |
| c016 | `OUTPUT/docs/03_architecture.md` | C4-контейнеры, потоки | arch | all |
| c017 | `OUTPUT/docs/adr/0001`…`0007` | решения | arch | all |
| c018 | `OUTPUT/tooling/cicd-and-environments.md` | окружения, пайплайн | ci | platform |
| c019 | `OUTPUT/tooling/verify-commands.md` | команды проверок | verify | all |
| c020 | `OUTPUT/roadmaps/d-cut-list.md` | нарезка D | plan | all |

## Паки по заданиям

| pack | D | Путь |
|------|---|------|
| P01 | D01 | `OUTPUT/context/packs/P01.md` |
| P02 | D02 | `OUTPUT/context/packs/P02.md` |
| P03 | D03 | `OUTPUT/context/packs/P03.md` |
| P04 | D04 | `OUTPUT/context/packs/P04.md` |
| P05 | D05 | `OUTPUT/context/packs/P05.md` |
| P06 | D06 | `OUTPUT/context/packs/P06.md` |
| P07 | D07 | `OUTPUT/context/packs/P07.md` |
| P08 | D08 | `OUTPUT/context/packs/P08.md` |
| P09 | D09 | `OUTPUT/context/packs/P09.md` |
| P10 | D10 | `OUTPUT/context/packs/P10.md` |
| P11 | D11 | `OUTPUT/context/packs/P11.md` |
| P12 | D12 | `OUTPUT/context/packs/P12.md` |
| P13 | D13 | `OUTPUT/context/packs/P13.md` |
| P14 | D14 | `OUTPUT/context/packs/P14.md` |

## Stats

- total_chunks: 20 общих + 14 паков (по 4–7 якорей)
- sources: docs / specs / security / tooling / roadmaps / LIBRARY
- updated: 2026-11-04

## Notes

- Пак без `validation.ok` к D не привязывается (`catalogs/context-rag.md`).
- Тела specs в промпты не копируются: только path + якорь.
