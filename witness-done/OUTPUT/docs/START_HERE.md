# START HERE — установка и порядок разработки

> Сгенерировано Witness Done v1.31.0 для проекта NOVA CRM (web-app + read-only backend).

## 0. Вход — новое сообщение человека

Каждый запрос проходит три шага до любой правки кода:

```bash
node witness-done/SEED/sp-tools/sp.mjs status
node witness-done/SEED/sp-tools/sp.mjs intake "<запрос дословно>"
node witness-done/SEED/sp-tools/sp.mjs next
```

- Запись входа: `journal/intake/<YYYYMMDD-HHMM>-<slug>.md`.
- Решение: `sp decide "<решение>"` → `journal/decisions/DEC-###`.
- Закрытие: `sp close <ID> --ref <change-id|Dxx|DEC-###>`.
- Правила агента: `AGENTS.md` в корне проекта; адаптеры IDE — `sp rules --sync`.

## 1. Новый чат / новый агент — сначала сюда

1. `witness-done/OUTPUT/roadmaps/progress.md` — статусы D.
2. При сомнении «всё ли покрыто» — `witness-done/OUTPUT/roadmaps/coverage-matrix.md`.
3. Этот файл — установка и порядок.
4. Нужный `witness-done/OUTPUT/prompts/Dxx_*.md` + его `CONTEXT_PACK` (`witness-done/OUTPUT/context/packs/`).
5. Loop: код → `sp-verify --gate pre_ci` → `done` только с evidence (`catalogs/agent-harness.md`).

Не начинай следующий D, пока предыдущий в порядке `00_overview.md` не `done`.
Не считай CI первой приёмкой — `pre_ci` локально обязателен.

## 2. Обратная связь прогона

`witness-done/OUTPUT/docs/feedback.md` — готовность к разработке, полнота комплекта и вопросы.
Критичных вопросов, блокирующих D01, нет; defaults перечислены явно.

## 3. Статус фабрики

`READY_WITH_DEFAULTS` (см. `witness-done/OUTPUT/MANIFEST.md`).
`design_input: present` — `witness-done/OUTPUT/docs/design-notes.md`.
CI/CD: `witness-done/OUTPUT/tooling/cicd-and-environments.md`.

## 4. Установка

```bash
npm install                     # фронтенд + backend workspace
npm run lint
npm run typecheck
npm run test
supabase start                  # локальный Postgres/Auth/PostgREST
supabase db reset               # миграции + seed
docker compose -f infra/replica/docker-compose.yml up -d replica
node infra/replica/check.mjs    # лаг и запрет записи
npm run dev                     # http://127.0.0.1:5173
```

Переменные — `witness-done/OUTPUT/tooling/env-vars.md`; образец `.env.example` появляется в D01.
Секреты в git не коммитить: `service_role` живёт только в seed-контуре.

### Definition of first green (после D01)

`npm run lint && npm run typecheck && npm run test` зелёные на каркасе, `GET /health` отвечает 200.

## 5. Порядок заданий

`D01 → D02 → D03 → D04 → D05 → D06 → D07 → D08 → D09 → D10 → D11 → D12 → D13 → D14`.
Срезы S0…S10 и wave-smoke — `roadmaps/00_overview.md`; граф — `roadmaps/dependency-graph.md`.

| Срез | D | Что считается результатом |
|------|---|----------------------------|
| S0 | D01 | `/health`, строгий env, логгер без секретов, rate limit |
| S1 | D02 | 4 таблицы, RLS, seed, pgTAP зелёный |
| S2 | D03 | RPC перехода, 15 запрещённых пар отклоняются, история append-only |
| S3 | D04 | вход с MFA, guard, оболочка по роли |
| S4 | D05, D06 | объекты: контракт и экран |
| S5 | D07, D08 | задачи: контракт и экран |
| S6 | D09 | «Мои задачи» со счётчиками |
| S7 | D10, D11 | реплика, вьюхи, read-only API отчётов |
| S8 | D12 | экран отчётов и деградация |
| S9 | D13 | метрики, алерты, бэкап, runbooks |
| S10 | D14 | e2e, security-гейты, деплой, документация |

## 6. Карта папок OUTPUT

Агент не читает всё подряд: открывает пути из CONSUMES D-промпта.

| Папка | Зачем |
|-------|--------|
| `docs/` | анализ, архитектура, ADR, NFR, START_HERE, отчёты сборки |
| `specs/` | data-model, ERD, OpenAPI, domain-rules, контракты |
| `security/` | threat-model, authz, secrets, ASVS-чеклист |
| `roadmaps/` | обзор, граф, d-cut-list, coverage, progress, backlog |
| `prompts/` | 14 исполняемых D-срезов |
| `context/` | index и packs — точечный контекст |
| `tests/` | тест-планы D и общий INDEX |
| `tooling/` | установка, линт, CI, env, deploy, harness, verify-commands |
| `runtime/` | исполняемый план подъёма и проверки |
| `evidence/` | акты `sp-verify` (появятся при разработке) |

## 7. Что уже в корне проекта

`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.cursor/rules/`, `.eslintrc.js`,
`eslint-plugin-local-rules/`, `.github/workflows/ci.yml`, `scripts/smoke/wave-api-smoke.sh`,
`scripts/smoke/product-smoke.sh`, `witness-done/` (канон и OUTPUT).

## 8. Перед D01

- [ ] `npm install` выполнен
- [ ] `.env` создан из `tooling/env-vars.md`, в git не добавлен
- [ ] `supabase start` работает
- [ ] Прочитан `feedback.md`
- [ ] `progress.md` открыт для отметки статусов
