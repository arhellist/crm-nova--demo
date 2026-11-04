# START HERE — шаблон (PIPELINE/10 заполняет под проект)

> Сгенерировано Witness Done v{{VERSION}}

## 0. Вход — новое сообщение человека

Каждый запрос (задача, вопрос, доработка) проходит три шага, до любой правки кода:

```bash
node witness-done/SEED/sp-tools/sp.mjs status   # где стоит проект
node witness-done/SEED/sp-tools/sp.mjs intake "<запрос дословно>"   # запись входа
node witness-done/SEED/sp-tools/sp.mjs next     # маршрут
```

- Запись входа: `journal/intake/<YYYYMMDD-HHMM>-<slug>.md` — запрос цитатой, снимок состояния,
  `kind` (`new|question|change|task|bugfix`), `next:`, `связано:`.
- Решение (выбор, догадка, конфликт): `sp decide "<решение>"` → `journal/decisions/` как `DEC-###`.
- Закрытие: `sp close <ID> --ref <change-id|Dxx|DEC-###>`.
- Правила для агента: `AGENTS.md` в корне проекта; адаптеры IDE — `sp rules --sync`
  (`catalogs/agent-rules.md`).
- Канон входа и решений: `catalogs/intake-and-decisions.md`.

## 1. Новый чат / новый агент — сначала сюда

1. `OUTPUT/roadmaps/progress.md` — статусы D
2. При сомнении «всё ли покрыто» — `OUTPUT/roadmaps/coverage-matrix.md`  
3. Этот файл — установка и порядок  
4. Нужный `OUTPUT/prompts/Dxx_*.md` + его `CONTEXT_PACK` (`OUTPUT/context/packs/`)  
5. Loop: код → `sp-verify --gate pre_ci` → `done` только с evidence (`catalogs/agent-harness.md`)  

Не начинай следующий D, пока предыдущий в порядке выполнения не `done` (кроме явной просьбы человека).  
Не считай CI первой приёмкой — **pre_ci локально обязателен** (`catalogs/verification-tax.md`).

## Обратная связь прогона (обязательно прочитай)

`OUTPUT/docs/feedback.md` — готовность к разработке, полнота комплекта D/docs, **вопросы на уточнение**.  
Если есть критичные вопросы — ответь в `INPUT/ANSWERS.md` до или параллельно с D01.

## Статус фабрики

`READY` | `READY_WITH_DEFAULTS` | `BLOCKED` — см. MANIFEST.  
`design_input:` present | none  
CI/CD: `OUTPUT/tooling/cicd-and-environments.md`

## Карта папок OUTPUT (для агента)

Агент **не** читает всё подряд: открывает пути из CONSUMES D-промпта.

| Папка | Зачем |
|-------|--------|
| `docs/` | Анализ, архитектура, ADR, START_HERE, отчёты сборки |
| `specs/` | data-model, OpenAPI, events, модули |
| `security/` | threat-model, authz, secrets |
| `roadmaps/` | план фаз, граф, **progress**, backlog |
| `prompts/` | исполняемые D-срезы |
| `context/` | index + packs (RAG) — точечный контекст |
| `evidence/` | VerificationTax JSON после `sp-verify` |
| `tests/` | чеклисты приёмки по D |
| `tooling/` | install/lint/CI/env + **harness** / verify-commands / entry |
| `intake/` | записи входа `YYYYMMDD-HHMM-<slug>.md` (запрос → маршрут) |
| `rules/` | `definition-of-done.md`, `INSTALL.md`, `previous/` (правила живут в корне: `AGENTS.md`) |

## 2. Установка

Подставь команды из `OUTPUT/tooling/install-order.md` и `lint-setup.md` (**стек-зависимые**).

Примеры:

- JS/TS: `npm install` && `npm run lint`
- Go: `go test ./...` && `golangci-lint run`
- Java: `./mvnw verify` (или Gradle)

### Definition of first green (после D01)

См. D01 PRODUCES + `tooling/lint-setup.md`. Зафиксируй фактические команды после D01.

## 3. Что уже в корне

Перечисли **фактические** файлы после шага 08 (не выдумывай `.eslintrc.js` для чистого Go).

## 4. Порядок разработки

1. Cursor Agent в `PROJECT_ROOT`
2. Порядок в `roadmaps/00_overview.md` + статусы в `progress.md`
3. PRE-CHECK + CONTEXT_PACK (validation_ok) + FIT_CHECKS
4. Код только PRODUCES
5. `sp-verify --d Dxx --gate pre_ci` → evidence
6. `progress.md` = `done` + evidence_ref; отметить `tests/test-plan-Dxx.md`
7. Перед релизом: `sp-verify --gate pre_release`

## 5. Документы

| Документ | Зачем |
|----------|--------|
| `OUTPUT/docs/feedback.md` | Обратная связь прогона: готовность, дыры, вопросы |
| `OUTPUT/roadmaps/progress.md` | **Статус реализации** между чатами |
| `OUTPUT/roadmaps/coverage-matrix.md` | ТЗ → D (полнота IN SCOPE) |
| `OUTPUT/tooling/cicd-and-environments.md` | Окружения и порядок деплоя |
| `OUTPUT/docs/design-notes.md` | Визуальный язык (если design present) |
| `OUTPUT/MANIFEST.md` | Статус фабрики (не кода продукта) |
| `OUTPUT/docs/03_architecture.md` | Архитектура |
| `OUTPUT/specs/`, `security/` | Контракты |
| `OUTPUT/docs/07_module_plan.md` | Какие модули LIBRARY включены |
| `OUTPUT/docs/10_consistency_report.md` | Аудит docs |
| `OUTPUT/tests/` | Тест-план |

## 6. GATE

Схема БД P0, публичный OpenAPI, auth model — если помечены в roadmap.
