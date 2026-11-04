# 10_handoff_checklist — передача проекта в разработку

> Состояние на 2026-11-04, версия канона 1.31.0. Вердикт: `READY_WITH_DEFAULTS`.

## 1. Комплект документации

- [x] `docs/01_analysis.md` — цели, KPI, IN/OUT, 17 сценариев
- [x] `docs/01_questions.md` — defaults и подтверждения
- [x] `AGENTS.md` — конституция, INV-001…INV-011
- [x] `docs/03_architecture.md` + ADR-0001…0007
- [x] `specs/data-model.md`, `erd.mermaid`, `domain-rules.md`
- [x] `specs/openapi.yaml` (health, replication, metrics, три отчёта)
- [x] `security/threat-model.md` (T01–T22), `authn-authz.md` (SEC-01…SEC-12)
- [x] `security/checklist.md` — ASVS L2
- [x] `docs/nfr.md` — NFR1…NFR22 с числом, проверкой и владельцем
- [x] `docs/07_module_plan.md`, `07_conflicts.md`, `07_methodology_apply.md`
- [x] `docs/design-notes.md` — токены и компоненты из `INPUT/design/Design.html`

## 2. План разработки

- [x] `roadmaps/00_overview.md`, `dependency-graph.md`
- [x] `roadmaps/d-cut-list.md` — 14 кандидатов, OVER = 0
- [x] `roadmaps/coverage-matrix.md` — P0 missing = 0
- [x] `roadmaps/progress.md` — 14 строк
- [x] `roadmaps/improvement-backlog.md`
- [x] `prompts/D01…D14` — 3 батча `d-prompt-quality` = pass
- [x] `context/index.md`, `packs/P01…P14` — все `validation.ok`
- [x] `tests/test-plan-D01…D14`, `tests/INDEX.md`

## 3. Tooling и окружение

- [x] `.eslintrc.js` + `eslint-plugin-local-rules/`
- [x] `.github/workflows/ci.yml` — lint, typecheck, unit, pgTAP, integration, replication, security, e2e
- [x] `tooling/cicd-and-environments.md`, `deploy.md`, `env-vars.md`, `install-order.md`
- [x] `tooling/harness.md`, `verify-commands.md`, `pre-commit.md`, `dependency-policy.md`
- [x] `runtime/runtime-plan.json` — `runtime-plan` gate pass
- [x] `docs/runbooks/product-smoke.md`
- [x] `scripts/smoke/wave-api-smoke.sh`, `scripts/smoke/product-smoke.sh`

## 4. Правила в корне

- [x] `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`
- [x] `.cursor/rules/witness-done.mdc` и остальные адаптеры (`sp rules --check` — 13 целей)
- [x] Типизация и обязательные автотесты в правилах
- [x] VerificationTax, CONTEXT_PACK, harness loop в правилах
- [x] Политика подробных комментариев (`catalogs/code-comments.md`)

## 5. Приёмка

- [x] `docs/exit-criteria.md` — E1…E28 с ожидаемым доказательством
- [x] `docs/10_consistency_report.md` — BLOCKER = 0
- [x] `docs/feedback.md`
- [x] `docs/START_HERE.md`
- [ ] `sp-verify --gate acceptance` — станет зелёным после D01–D14 (тестов ещё нет)
- [ ] `sp-verify --gate product-smoke` — требует поднятого staging
- [ ] `spec-state/` и baseline — только после `SELF_AUDIT: PASS` и кода

## 6. Что человеку сделать до D01

1. `npm install`; создать `.env` по `tooling/env-vars.md`, не коммитить.
2. `supabase start` && `supabase db reset`.
3. Ответить на вопросы 1–2 из `feedback.md` (домены и владелец `API_TOKEN`).
4. Открыть `prompts/D01_platform_skeleton.md` и работать по нему.

## 7. Известные ограничения

- Продуктовый smoke и acceptance-гейт не могут быть зелёными до появления кода — это ожидаемо.
- Реплика не HA и не failover (ADR-0003) — осознанное решение.
- ПДн в ЕС требуют правовой оценки 152-ФЗ до реальных данных.
