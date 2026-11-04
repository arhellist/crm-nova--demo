# OUTPUT MANIFEST

> Паспорт прогона: единственное место, где записано, где мы стоим и что уже готово.
> Статусы: `pending` | `done` | `needs_human` | `blocked` | `skipped`

## Мета

| Поле | Значение |
|------|----------|
| Проект | NOVA CRM |
| MODE | greenfield |
| Режим прогона | full |
| PROJECT_ROOT | `/home/alex/Документы/MyProjects/TestCRM` |
| FACTORY_PATH (путь к фабрике) | `witness-done/` |
| Дата старта прогона | 2026-11-04 |
| Версия фабрики | 1.31.0 (копия в `witness-done/`, не обновлялась — DEC-003) |
| Канон проверки 10b | 1.31.1 (`MyProjects/WitnessDone`, тег `v1.31.1`; DEC-041 канона) |
| Профиль | web-app |
| Отклонения от профиля | добавлен акцент `read-only backend` (Fastify + вторичная PostgreSQL-реплика, отчётность); `admin-panel` снят (провижининг вне UI); `caching-redis` снят; `rate-limiting` включён (периметр + API) |
| Язык артефактов | русский |
| design_input | present (`INPUT/design/Design.html`) |
| coverage_matrix | done |
| wave | C |
| c_subwave | C4 |
| c2_batch | 3/3 |
| last_completed_step | R01 |
| Текущий шаг | D01 — `OUTPUT/prompts/D01_platform_skeleton.md` (R01 закрыт) |
| 10b_self_audit | done (PASS; `open_criteria: 28`, отложенные гейты перечислены в отчёте) |
| git | ветка `nova-crm`, коммит `a2c68a1` (инструментовка шага 08; `main` канона не тронут — DEC-004) |
| answers_attempts | 0 |
| defaults_applied | false |
| intake_required | true |
| decisions_log | `journal/decisions/` (индекс — `journal/decisions.md`) |
| last_intake | `20261104-2050-horosho-patch-etot-rep-no-ne-fabriku-a-e` (закрыт → DEC-003, DEC-004) |
| `.cursorrules` | done |
| `AGENTS.md` | done (протокол входа; конституция — шаг 02) |
| `CLAUDE.md` | done |
| `GEMINI.md` | done |
| `.eslintrc.js` | done |
| `eslint-plugin-local-rules` | done |

## Статус шагов — Greenfield (00–10b)

| Шаг | Файл | Статус | Артефакты |
|-----|------|--------|-----------|
| 00 | bootstrap | done | `OUTPUT/MANIFEST.md`, `docs/00_run_log.md`, `AGENTS.md`, адаптеры IDE, `journal/`, pre-commit |
| 01 | analyze | done | `docs/01_analysis.md`, `docs/01_questions.md` (0 открытых критичных вопросов, `business_goals: ok`) |
| 02 | constitution | done | `AGENTS.md` (INV-001…INV-011), `docs/design-notes.md`, `rules/definition-of-done.md`, `rules/INSTALL.md`, адаптеры 13/13 |
| 03 | architecture | done | `docs/03_architecture.md` (C4 + 3 sequence), `docs/adr/0001…0007`, `specs/modules.md` |
| 04 | data_api | done | `specs/data-model.md`, `specs/erd.mermaid`, `specs/openapi-outline.md`, `specs/openapi.yaml`, `specs/domain-rules.md`, `specs/contracts-checklist.md` |
| 05 | security | done | `security/threat-model.md` (T01–T22), `security/authn-authz.md` (SEC-01…SEC-12), `security/checklist.md`, `security/secrets-and-config.md`, `security/data-protection.md` |
| 06 | nfr | done | `docs/nfr.md` (NFR1–NFR22 с числом, проверкой, владельцем), `docs/capacity-notes.md`, `roadmaps/nfr-work-items.md` |
| 07 | library | done | `docs/07_module_plan.md` (4 include/adapt, 8 skip), `docs/07_conflicts.md` (0 blocker), `docs/07_methodology_apply.md` |
| 08 | tooling | done | `.eslintrc.js` + `eslint-plugin-local-rules/`, `.github/workflows/ci.yml` (12 джоб), `tooling/*` (14 док.), smoke-скрипт и runbook. `runtime/runtime-plan.json` собирается после C3 (нужны фразы `Axx` из контракта) |
| 09 | roadmap_prompts | done | C1: `roadmaps/00_overview.md`, `dependency-graph.md`, `progress.md`, `d-cut-list.md` (14 D, OVER=0), `coverage-matrix.md` (missing=0), `context/index.md`. C2: `prompts/D01…D14` + `context/packs/P01…P14`, 3 батча `d-prompt-quality` = pass. C3: `tests/test-plan-D01…D14`, `tests/INDEX.md`, `roadmaps/improvement-backlog.md` |
| 10 | assembly | done | `docs/10_consistency_report.md` (BLOCKER=0), `START_HERE.md`, `exit-criteria.md` (E1–E28), `feedback.md`, `10_handoff_checklist.md`, `10_improvements.md`, `runtime/runtime-plan.json` (gate pass), `scripts/smoke/product-smoke.sh` |
| 10b | self_audit | done | `docs/10b_self_audit.md`, `10b_self_audit.machine.json` (PASS, `open_criteria: 28`, `prompts_checked: 14`); акты `SELF_AUDIT`, `ACCEPTANCE` (`scope: deferred`), `RELEASE-product-smoke` (`na: true`), `RELEASE-runtime-plan` (`accepted_count: 0`), 3 батча `prompt-quality`; `doctor --strict` = ok, `rules --check` = 13/13. Гейты пересняты каноном 1.31.1 (DEC-003); базовая линия — R01, `runtime`/smoke — `pre_release`. Аудит канона 1.31.0 и статус после патча — `docs/AUDIT-witnessdone-1.31.0.md` |

## Статус шагов — Brownfield (R00–R05)

| Шаг | Файл | Статус | Артефакты |
|-----|------|--------|-----------|
| R00 | reverse_engineer | pending | `docs/03_architecture.md`, `specs/*`, `coverage-matrix.md` |
| R01 | baseline_specs | done | `spec-state/config.yaml` (домены: auth, objects, tasks, reporting, platform), `spec-state/baseline/{auth,objects,tasks,reporting,platform}/spec.md` — 26 требований MUST/SHALL, 52 сценария; `--gate baseline` → `tax_pass: true` (`evidence/BASELINE.json`) |
| R02 | propose_change | pending | `spec-state/changes/<id>/{proposal,design,tasks}.md`, `specs/*.md` |
| R03 | apply_change | pending | код + тесты, `tasks.md` 100% |
| R04 | verify_change | pending | `evidence/CHANGE-<id>.json` |
| R05 | archive_change | pending | baseline обновлён, `spec-state/archive/<date>-<id>/` |

## Индекс артефактов

- `docs/exit-criteria.md` — критерии завершения `E1…En` с доказательствами
- `docs/10b_self_audit.md` + `docs/10b_self_audit.machine.json` — самопроверка 10b
- `docs/AUDIT-witnessdone-1.31.0.md` + `.machine.json` — аудит канона: блокеры 10b и ложные зелёные гейты; §9 — статус после патча 1.31.1
- `docs/audit-probes-1.31.0/` — намеренно красные пробы аудита (не акты шагов)
- `evidence/*.json` — акты гейтов 10b, снятые каноном 1.31.1
- `decisions.md` — журнал решений `DEC-###` (живёт в `journal/`, не в OUTPUT)
- `journal/intake/` — записи входа `YYYYMMDD-HHMM-<slug>.md`
- `docs/00_run_log.md` — журнал прогона

## Gaps / CONFLICTS blockers

Видимые на шаге 00 gaps — все закрыты, ни один не остался открытым:

| # | Gap | Где закрыт |
|---|-----|-----------|
| 1 | OWASP/ASVS не привязан к доказательствам | шаг 05: ASVS L2 → SEC-01…SEC-12 и T01–T22 |
| 2 | Порог лага репликации и поведение при разрыве | шаги 04–06: NFR + отчёт `replication` + деградация read-only |
| 3 | Границы «дизайн → токены» | шаги 02–03: `design-notes.md`, ADR-0004 |
| 4 | Отчётные вьюхи без DDL и контракта | шаг 04: DDL, ERD, OpenAPI 3.1 |
| 5 | Провижининг вне UI без регламента | шаги 03/05: `security/secrets-and-config.md`, runbook |
| 6 | Место `spec-state/` | шаг 03: ADR-0007 |
| 7 | Перечень `INV-###` | шаги 02/05: INV-001…INV-011 |

## Готовность к коду

- [x] LIBRARY (07) без blocker CONFLICTS
- [x] D-prompts (09) с PRE-CHECK
- [x] Корневые cursorrules / AGENTS / адаптеры IDE (`sp rules --check`)
- [x] Consistency BLOCKER закрыты
- [x] `docs/exit-criteria.md` заполнен, у каждого `E<n>` есть доказательство
- [x] `sp-verify --gate d-prompt-quality` (все пачки) → `tax_pass: true`
- [ ] `sp-verify --gate acceptance` → `tax_pass: true` (каждая фраза объявлена тестом, план согласован) — ждёт D01–D14
