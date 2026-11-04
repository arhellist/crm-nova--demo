# PIPELINE 08 — Tooling + линтеры + CI/CD + окружения

## Роль

Platform engineer. Ставишь **реальные** конфиги линтера/CI в `PROJECT_ROOT` **под стек** и документируешь **полный цикл окружений и деплоя** (`catalogs/cicd-environments.md`). Плюс tooling-пакет в OUTPUT.

## Вход

- `AGENTS.md` в корне проекта (конституция), architecture, nfr, security/secrets
- `OUTPUT/MANIFEST.md` → `PROJECT_ROOT`
- `@witness-done/catalogs/stack-policy.md`
- `@witness-done/catalogs/cicd-environments.md` (**обязательно**)
- `@witness-done/catalogs/design-input.md` — если design present, допиши токены в `design-notes.md`
- `@witness-done/SEED/eslintrc.baseline.js` + `eslint-plugin-local-rules/` — **только если** FE и/или backend на JS/TS
- `@witness-done/SEED/golangci.yml.example` — **только если** backend Go
- `@witness-done/TEMPLATES/tooling-pack.md`
- `@witness-done/TEMPLATES/cicd-and-environments.md`
- `@witness-done/SEED/ci.yml.example`
- `@witness-done/catalogs/verification-tax.md`
- `@witness-done/catalogs/contour-smoke.md`
- `@witness-done/catalogs/agent-harness.md`
- `@witness-done/catalogs/context-rag.md`
- `@witness-done/SEED/sp-tools/` — CLI `sp-retrieve` / `sp-verify`
- `@witness-done/SEED/smoke/` — product-smoke + wave-api-smoke examples
- `@witness-done/TEMPLATES/runtime-plan.md` + `@witness-done/catalogs/runtime-plan.md` (**обязательно с v1.23**)
- `@witness-done/SEED/sp-tools/selftest.sh` — **прогоняется перед сдачей**: он проверяет, что гейты
  падают на неразобранном входе, а не пропускают его (правило v1.24)

## Выбор tooling по стеку

| Стек | Линтер / проверка в корне | Заметки |
|------|---------------------------|---------|
| JS/TS + frontend-фреймворк | `.eslintrc.js` + local-rules + **tsc** | Plain JS app-код запрещён (`typing-and-tests`) |
| Backend Node **TS** | тот же ESLint + tsc | не `.js` для domain/API |
| Backend **Go** | `.golangci.yml` + `go test` | |
| Backend **Java/Kotlin** | Checkstyle/Spotless + unit tests | |
| Backend **Python** | `ruff` + `mypy`/pyright + `pytest` | типы на границах обязательны |
| Backend **PHP** | PHPStan/Psalm + PHP-CS-Fixer + PHPUnit | типы на границах обязательны |
| Иной стек | штатный линтер + typecheck + тест-раннер языка | добавить строку в эту таблицу, а не подгонять чужой toolchain |
| Смешанный | FE и BE — каждый своим toolchain | один `verify-commands.md` на всё |

**Запрещено:** ставить toolchain чужого стека (ESLint в Go-проекте), оставлять `verify-commands.md`
с командами, которых в проекте нет, и app-код на plain JS там, где выбран TS.
Язык как таковой канон не запрещает: любой допустим, если линтер, типы и тесты под него есть.

## Линтеры (как раньше)

Скопируй/адаптируй SEED под структуру (`web/`/`backend/`/`frontend/` — как в architecture).  
Scripts `lint` согласованы с `.cursorrules`.

## CI/CD и окружения (обязательно с v1.7)

Создай **`OUTPUT/tooling/cicd-and-environments.md`** по шаблону и канону:

1. Таблица env: **local / ci / staging / production** (или обоснованное сокращение).
2. Что бежит на **PR** (lint, test) — **без** prod deploy.
3. Что бежит на **staging** (migrate → api → workers → web → health smoke → **wave API-smoke**).
4. Что бежит на **production** (manual approval / protected environment + **полный product-smoke**).
5. Порядок развёртывания и rollback.
6. Где живут secrets (имена — в `env-vars.md` **по колонкам окружений**).
7. Внешние сторы (OLAP/PSP): memory в CI; живой прогон — staging/release checkbox (`contour-smoke.md`).

Обнови:

- `OUTPUT/tooling/deploy.md` — согласован с порядком из cicd doc  
- `OUTPUT/tooling/env-vars.md` — колонки local | ci | staging | prod  
- `SEED/ci.yml.example` → `OUTPUT/tooling/ci.yml.example` и по возможности `PROJECT_ROOT/.github/workflows/ci.yml`  
  - job `lint` (+ test) на pull_request  
  - job deploy (если есть) — `environment:` + `workflow_dispatch` / tags, **не** на каждый push в main без защиты  

## Тесты и typecheck (обязательно с v1.7.1)

По `catalogs/typing-and-tests.md` в `OUTPUT/tooling/`:

1. `lint-setup.md` — lint **и** typecheck (`tsc --noEmit` / аналог); запрет plain JS для app.
2. Выбрать test runner (vitest/jest / `go test` / Surefire) → скрипт `test` в package.json / Makefile.
3. `install-order.md` — `lint` → `typecheck` → `test`.
4. CI: job lint+typecheck; job **test** **без** `continue-on-error` для app-пакетов после D01 (scaffold D01 — placeholder `test` допустим).

Краткий `OUTPUT/tooling/test-strategy.md` (опционально, если не влезло в lint-setup): unit vs integration vs e2e smoke.

## VerificationTax + Agent Harness + Context RAG + Contour smoke (обязательно с v1.10)

1. CLI уже доступен по `witness-done/SEED/sp-tools/` — копировать не нужно (DEC-034). Если проект исторически держит копию в `scripts/sp-tools/`, она допустима, но путь в `OUTPUT/tooling/` должен быть один.
2. Создай **`OUTPUT/tooling/verify-commands.md`**: команды lint/typecheck/test; **wave smoke** vs **full product-smoke**; как вызывать `sp-verify --d Dxx --gate pre_ci` и `sp-verify --gate pre_release`.
3. Создай **`OUTPUT/tooling/harness.md`** по `catalogs/agent-harness.md`: loop, Axx → evidence `acceptance_ids`, resume-фразы, запрет done без evidence.
4. Из **`SEED/smoke/`** материализуй:
   - `OUTPUT/docs/runbooks/product-smoke.md` ← `product-smoke.md.example` (подставь ops проекта);
   - `scripts/smoke/wave-api-smoke.sh` ← `wave-api-smoke.sh.example` (или `wave-<group>.sh` на группу).
5. **Собери план рантайма** — `OUTPUT/runtime/runtime-plan.json` по `TEMPLATES/runtime-plan.md`.
   Это не текст «поднять как-нибудь», а исполняемый контракт окружения, выведенный из твоих же
   входов прогона:

   | Берёшь из | Что попадает в план |
   |-----------|---------------------|
   | `architecture.md` | `stack[]`, сервисы и порты → `up[].id`, `up[].ready.url` |
   | `04_data_and_api.md` | миграции, seed, тестовый пользователь → `seed[]` |
   | `env-vars.md` | имена переменных, дефолты local → не коммитить значения, только имена |
   | `01_contract.md` | номера фраз `Axx.k` → `verify[].acceptance` |
   | `nfr` / `cicd-and-environments.md` | таймауты готовности → `ready.timeout_s`, `down[]` |

   Для каждой фразы из `01_contract.md` — либо `cmd`, который её проверяет, либо `na` с причиной.
   Плейсхолдеры (`{{...}}`, `TODO`) запрещены: гейт их не пропустит.

6. Проверь план:

   ```bash
   node witness-done/SEED/sp-tools/sp-verify.mjs --gate runtime-plan   # статика: tax_pass: true
   node witness-done/SEED/sp-tools/sp-verify.mjs --gate runtime        # подъём + проверка + teardown
   ```

   Второй прогон — то, что раньше называлось «нет runtime-верификации». Он поднимает окружение,
   ждёт готовности, гоняет проверки по фразам, всегда снимает окружение и пишет акт.
7. В `cicd-and-environments.md` явно: **pre_ci локально до push**; CI — второй прогон unit; **wave** после `split_group`; **pre_release** + full smoke до staging/prod.
8. CI workflow: не soft-fail typecheck/test на app; **обязателен** job проверки входа и актов:
   `sp doctor --strict`, `sp rules --check`, `sp-verify --gate evidence-sync` (шаблон —
   `SEED/ci.yml.example`). Правка кода без акта по затронутым D не должна проходить PR.

## Вход, правила IDE и pre-commit (обязательно с v1.14)

1. CLI живёт в `witness-done/SEED/sp-tools/` — копия в `scripts/sp-tools/` не нужна (DEC-034);
   единый вход: `status`, `intake`, `next`, `decide`, `close`, `rules`, `doctor`.
2. Проверь, что адаптеры IDE на месте после шага 02:
   ```bash
   node witness-done/SEED/sp-tools/sp.mjs rules --check   # exit 0
   ```
   Если шаг 02 пропущен или правила правили руками — `sp rules --sync`.
3. Скопируй `SEED/git-hooks/pre-commit` в `.git/hooks/pre-commit` (или настрой `core.hooksPath`)
   и сделай исполняемым. Хук вызывает `sp doctor --staged`.
4. Пропиши в `OUTPUT/tooling/harness.md` маршрут входа: `sp status → sp intake → sp next →
   sp decide` и правило «правка вне `PRODUCES` и без записи входа — отклоняется `doctor`».
5. В `OUTPUT/tooling/cicd-and-environments.md` явно: PR-джобы `lint`, `test`, `doctor`, `rules`.
   Deploy с них не запускается.

## Общий пакет `OUTPUT/tooling/`

1. `install-order.md`  
2. `lint-setup.md`  
3. **`cicd-and-environments.md`**  
4. `ci.yml.example` + корневой workflow  
5. `env-vars.md`  
6. `deploy.md`, `observability.md`  
7. `dependency-policy.md`, `pre-commit.md`  
8. `tsconfig.strict-notes.md` — если TypeScript  
9. **`verify-commands.md`**, **`harness.md`**  
10. **`entry.md`** — вход: `sp status/intake/next/decide`, где лежат `journal/intake/` и `journal/decisions/`  
11. Ссылки на `docs/runbooks/product-smoke.md` и `scripts/smoke/wave-*.sh`
12. **`runtime/runtime-plan.json`** — план подъёма и runtime-верификации (см. п.5)  

Секреты не коммитить. Боевой `.env` не создавать.

## Критерий done

- Линтер для каждого языка v1 + команда в CI  
- `cicd-and-environments.md` заполнен (не «TODO later»)  
- `verify-commands.md` + `harness.md` + `entry.md` есть  
- CLI доступен по `witness-done/SEED/sp-tools/` (копия не требуется, DEC-034), `sp rules --check` → exit 0, pre-commit установлен  
- workflow содержит джобы `doctor` и `rules` (вход и адаптеры проверяются в PR)  
- product-smoke runbook + wave-api-smoke script созданы из SEED  
- `OUTPUT/runtime/runtime-plan.json` собран из входов прогона (не заглушка), `--gate runtime-plan` → `tax_pass: true`  
- каждая фраза `01_contract.md` в плане: `cmd` или `na` с причиной; принятые `Axx` покрыты  
- START_HERE / AGENTS смогут сослаться на порядок деплоя, pre_ci и contours  

## MANIFEST

Шаг 08 done; перечисли линтеры + `cicd: documented` + `harness: documented` + `smoke: documented` + `entry: installed`.

## STOP

```text
TOOLING: OK
LINTERS: […]
CICD: documented
HARNESS: documented
ENTRY: installed (sp.mjs + pre-commit + CI doctor)
SMOKE: product + wave
RUNTIME: plan (up=N, verify=N, na=N) — tax_pass
Следующий шаг: PIPELINE/09_roadmap_and_dev_prompts.md
```
