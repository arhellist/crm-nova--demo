# OUTPUT MANIFEST

> Паспорт прогона: единственное место, где записано, где мы стоим и что уже готово.
> **Шаблон.** Шаг 00 копирует файл в `OUTPUT/MANIFEST.md` и заполняет поля. До шага 00
> `OUTPUT/MANIFEST.md` не существует — пустой `OUTPUT/` означает «прогон не начат».
> Статусы: `pending` | `done` | `needs_human` | `blocked` | `skipped`

## Мета

| Поле | Значение |
|------|----------|
| Проект | |
| MODE | greenfield \| brownfield |
| Режим прогона | full |
| PROJECT_ROOT | |
| FACTORY_PATH (путь к фабрике) | `witness-done/` |
| Дата старта прогона | |
| Версия фабрики | (из `VERSION`) |
| Профиль | agent-harness \| web-app \| data-platform \| custom (см. `PROFILES.md`) |
| Отклонения от профиля | — |
| Язык артефактов | русский |
| design_input | present \| none |
| coverage_matrix | pending \| done |
| wave | — |
| c_subwave | — |
| c2_batch | — |
| last_completed_step | — |
| Текущий шаг | — |
| 10b_self_audit | pending |
| answers_attempts | 0 |
| defaults_applied | false |
| intake_required | true |
| decisions_log | `journal/decisions/` (индекс — `journal/decisions.md`) |
| last_intake | — |
| `.cursorrules` | pending |
| `AGENTS.md` | pending |
| `CLAUDE.md` | pending |
| `GEMINI.md` | pending |
| `.eslintrc.js` | pending |
| `eslint-plugin-local-rules` | pending |

## Статус шагов — Greenfield (00–10b)

| Шаг | Файл | Статус | Артефакты |
|-----|------|--------|-----------|
| 00 | bootstrap | pending | |
| 01 | analyze | pending | |
| 02 | constitution | pending | |
| 03 | architecture | pending | |
| 04 | data_api | pending | |
| 05 | security | pending | |
| 06 | nfr | pending | |
| 07 | library | pending | |
| 08 | tooling | pending | |
| 09 | roadmap_prompts | pending | C1 d-cut-list → C2 D-тела → C3 test-plans |
| 10 | assembly | pending | |
| 10b | self_audit | pending | `docs/10b_self_audit.md`, `docs/10b_self_audit.machine.json` |

## Статус шагов — Brownfield (R00–R05)

| Шаг | Файл | Статус | Артефакты |
|-----|------|--------|-----------|
| R00 | reverse_engineer | pending | `docs/03_architecture.md`, `specs/*`, `coverage-matrix.md` |
| R01 | baseline_specs | pending | `spec-state/config.yaml`, `spec-state/baseline/<domain>/spec.md` |
| R02 | propose_change | pending | `spec-state/changes/<id>/{proposal,design,tasks}.md`, `specs/*.md` |
| R03 | apply_change | pending | код + тесты, `tasks.md` 100% |
| R04 | verify_change | pending | `evidence/CHANGE-<id>.json` |
| R05 | archive_change | pending | baseline обновлён, `spec-state/archive/<date>-<id>/` |

## Индекс артефактов

- `docs/exit-criteria.md` — критерии завершения `E1…En` с доказательствами
- `docs/10b_self_audit.md` + `docs/10b_self_audit.machine.json` — самопроверка 10b
- `docs/decisions.md` — журнал решений `DEC-###`
- `intake/` — записи входа `YYYYMMDD-HHMM-<slug>.md`

_

## Gaps / CONFLICTS blockers

_

## Готовность к коду

- [ ] LIBRARY (07) без blocker CONFLICTS
- [ ] D-prompts (09) с PRE-CHECK
- [ ] Корневые cursorrules / AGENTS / адаптеры IDE (`sp rules --check`)
- [ ] Consistency BLOCKER закрыты
- [ ] `docs/exit-criteria.md` заполнен, у каждого `E<n>` есть доказательство
- [ ] `sp-verify --gate d-prompt-quality` (все пачки) → `tax_pass: true`
- [ ] `sp-verify --gate acceptance` → `tax_pass: true` (каждая фраза объявлена тестом, план согласован)
