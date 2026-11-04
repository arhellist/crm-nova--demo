# PIPELINE 00 — Bootstrap

## Роль

Ты — оркестратор Witness Done. Твоя задача на этом шаге: **инициализировать прогон**, проверить вход и подготовить OUTPUT. Код приложения **не писать**. Версия — из `witness-done/VERSION`.

## Корень проекта (PROJECT_ROOT)

`PROJECT_ROOT` = директория, в которой лежит папка `witness-done/`  
(пример: если фабрика в `/app/witness-done`, то PROJECT_ROOT = `/app`).

На шагах **00**, **02** и **08** фабрика **обязана** писать файлы в `PROJECT_ROOT` (не только в OUTPUT):

| Файл | Шаг |
|------|-----|
| `PROJECT_ROOT/AGENTS.md` | 00 (протокол входа), 02 (конституция) |
| `PROJECT_ROOT/.cursorrules` | 02 |
| `PROJECT_ROOT/CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursor/rules/witness-done.mdc`, `.clinerules/witness-done.md`, `.devin/rules/witness-done.md` | 00 (генерация), 02 (обновление) |
| `PROJECT_ROOT/.cursor/commands/sp.md` и другие команды `/sp` | 00 |
| `PROJECT_ROOT/.eslintrc.js` | 08 |
| `PROJECT_ROOT/eslint-plugin-local-rules/` | 08 |
| `PROJECT_ROOT/.git/hooks/pre-commit` (или `core.hooksPath`) | 00 |
| `PROJECT_ROOT/.github/workflows/ci.yml` | 08 |

## Вход (обязательно прочитай)

- `@witness-done/INPUT/TECH_SPEC.md`
- `@witness-done/README.md`
- `@witness-done/VERSION`
- `@witness-done/TEMPLATES/manifest.md`
- `@witness-done/TEMPLATES/entry-protocol.md`
- `@witness-done/catalogs/agent-rules.md`
- `@witness-done/catalogs/intake-and-decisions.md`
- `@witness-done/SEED/agent-config/manifest.json`
- Опционально: `@witness-done/INPUT/DESIGN.html`, `@witness-done/INPUT/design/*.html` (см. `catalogs/design-input.md`)

## Правила

1. Если `TECH_SPEC.md` пустой или почти пустой — **остановись**. Перечисли минимальный набор полей, без которых прогон бессмысленен. Не выдумывай продукт.  
   Минимум: **бизнес-цель + KPI или явный gap**, название/суть, хоть один IN SCOPE / сценарий (`catalogs/business-goals.md`). Без § бизнес-целей — `needs_human`, не «додумаем на 03».
2. Не меняй файлы в `PIPELINE/`, `TEMPLATES/`, `catalogs/`, `LIBRARY/`, `SEED/` (кроме чтения).
3. Артефакты прогона пиши только в `OUTPUT/`; корень проекта — только файлы из таблицы выше.
4. Язык артефактов: **русский** (см. `catalogs/language-policy.md`). Английские аббревиатуры и имена технологий — только с пояснением при первом использовании. Заголовки разделов — на русском (не `Context`/`Decision`).
5. Правила агента живут **в корне проекта**, не в `OUTPUT/rules/`. В `OUTPUT/rules/` допустимы только `definition-of-done.md`, `INSTALL.md` и `previous/`.

## Сделай

### 1. Паспорт прогона

Скопируй шаблон и заполни:

```bash
mkdir -p OUTPUT
cp TEMPLATES/manifest.md OUTPUT/MANIFEST.md   # путь от корня фабрики
```

Заполни поля:

- название проекта из ТЗ;
- `MODE: greenfield` (или `brownfield`, если работа идёт по `PIPELINE/R00`…);
- дата старта прогона;
- **Версия фабрики** = содержимое `witness-done/VERSION`;
- явная строка `PROJECT_ROOT: …`;
- `FACTORY_PATH: witness-done/` — чтобы артефакты ссылались на канон, а не на «где-то там»;
- **профиль** (`PROFILES.md`): выбрать один и записать в MANIFEST вместе с отклонениями;
- `design_input: present | none` (есть ли HTML в INPUT/DESIGN.html или INPUT/design/*.html);
- `coverage_matrix: pending` (заполнится на шаге 09);
- `wave: A`, `c_subwave: —`, `last_completed_step: 00`;
- шаг 00 → `done` (или `needs_human`, если ТЗ недостаточно);
- `intake_required: true`, `decisions_log: journal/decisions/`, `last_intake: —`;
- корневые файлы `.cursorrules`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.eslintrc.js` → `pending`;
- `answers_attempts: 0`, `defaults_applied: false`;
- строки Brownfield `R00…R05` остаются `pending` — это состояние на будущее, не «сделано».

#### Профиль (обязательный выбор)

Профиль — набор акцентов под тип продукта, не набор модулей «на всякий случай». Выбери один из
`PROFILES.md` и обоснуй одной строкой:

| Профиль | Когда |
|---------|-------|
| `agent-harness` | агенты, инструменты, журнал событий, подтверждения человеком, воспроизводимость |
| `web-app` | CRUD/портал/личный кабинет: auth, роли, интерфейс, админка |
| `data-platform` | пайплайны, хранилище, аналитика, отчёты |
| `custom` | ни один не подходит — перечисли акценты сам, отклонения от пресета обязательны |

В ТЗ профиль может быть указан явно (§11/§13) — тогда бери его. Молча расширять профиль нельзя:
каждый добавленный акцент попадает в MANIFEST как «Отклонения от профиля».

### 2. Каталоги и вход

Создай каталоги (без лишних README): `OUTPUT/{docs,rules,specs,roadmaps,prompts,tooling,security,tests,context,context/packs,evidence}`.  
Записи входа и решения живут **не в `OUTPUT/`**, а в `journal/` в корне проекта: журнал коммитится.
**Не создавай** `OUTPUT/library/` — запрещён. Если каталог уже есть (остался от прошлого прогона) — удали и зафиксируй в run log.

Создай журнал решений из шаблона:

```bash
node SEED/sp-tools/sp.mjs journal --init   # journal/ из SEED/journal/ (пустая заготовка)
```

Команда создаёт `journal/{intake,decisions}` и пустой индекс `journal/decisions.md` и подставляет
название проекта в заголовок. Журнал **коммитится** вместе с кодом: `intake/` + `decisions/` +
`decisions.md`. Он append-only: записи добавляет `sp decide`, но читается и правится он руками.
Проверка — `sp journal --check --strict`.

### 3. Правила агента и протокол входа

Правила должны появиться **на этом шаге**, а не на 02: иначе первый же чат в проекте пройдёт мимо
Witness Done (никакого `AGENTS.md` ещё нет).

1. Создай `PROJECT_ROOT/AGENTS.md`: скопируй блок протокола из `TEMPLATES/entry-protocol.md`
   (маркеры `<!-- SP-ENTRY-PROTOCOL v1 -->` … `<!-- /SP-ENTRY-PROTOCOL -->` как есть) и добавь
   раздел «Конституция проекта» с пометкой «заполнится на шаге 02». Больше ничего не выдумывай.
2. Сгенерируй адаптеры IDE:

   ```bash
   node witness-done/SEED/sp-tools/sp.mjs rules --sync
   node witness-done/SEED/sp-tools/sp.mjs rules --check
   ```

   Создаются `.cursorrules`, `.cursor/rules/witness-done.mdc`, `CLAUDE.md`, `GEMINI.md`,
   `.github/copilot-instructions.md`, `.clinerules/witness-done.md`, `.devin/rules/witness-done.md`,
   команды `/sp`. Канон: `catalogs/agent-rules.md`. `--check` должен вернуть `exit 0`.
3. Установи pre-commit (если проект под git):

   ```bash
   cp witness-done/SEED/git-hooks/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
   ```

   Хук гоняет `sp doctor --staged` и не даёт закоммитить правку вне маршрута.

Запиши в MANIFEST: `AGENTS.md: done`, `.cursorrules: pending` (полная конституция — на 02),
`CLAUDE.md`/`GEMINI.md: done`.

### 4. Журнал прогона

Создай `OUTPUT/docs/00_run_log.md` — журнал прогона (шаг, время, заметка).

### 5. Краткий отчёт в чате

Скажи:

- готов ли вход к шагу 01;
- PROJECT_ROOT и VERSION;
- выбранный профиль и отклонения от него;
- `design_input`;
- какие 3–7 критичных gaps уже видны в ТЗ (без решения — только список);
- статус входа: `sp status` (пусто) и `sp rules --check` (exit 0).

## Формат ответа в чате

```text
BOOTSTRAP: OK | BLOCKED
PROJECT_ROOT: …
MODE: greenfield | brownfield
Профиль: agent-harness | web-app | data-platform | custom (+ отклонения)
Причина: …
Вход: AGENTS.md + адаптеры IDE + decisions.md + intake/
sp rules --check: PASS
Следующий шаг: PIPELINE/01_analyze_spec.md
```

## Lite-режим и минимальный пакет

Полный прогон нужен не каждой задаче. Два механизма снижают цену входа, не отменяя акт:

- **Режим прогона.** В `MANIFEST.md` поле `Режим прогона`: `full` (по умолчанию) или `lite`
  (`SP_LITE=1` — override). В `lite` шаги `self-audit` и `pre_release` не требуют
  `coverage-matrix.md` и `exit-criteria.md`; `progress.md` и `tax_pass` остаются обязательными.
- **Spec-packet.** `sp intake "<запрос>" --kind task` пишет `journal/intake/<ID>-packet.md`:
  цель, non-goals, критерии приёмки, evidence. Проверка — `sp-verify --gate spec-packet --intake <ID>`.
  Если задача не помещается в четыре секции, это не пакет, а `Dxx`.

- **Инварианты проекта.** Если правило повторяется в нескольких заданиях, заведи
  `OUTPUT/docs/project-invariants.md` (шаблон `TEMPLATES/project-invariants.md`, канон
  `catalogs/invariants.md`) и ссылайся на `INV-###` в `## INVARIANTS` задания.

## STOP

После записи артефактов — остановись. Не запускай шаг 01 сам, пока пользователь не вставит следующий промпт.
