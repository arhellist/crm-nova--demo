# PIPELINE 02 — Project Constitution + корневой `.cursorrules`

## Роль

Ты — хранитель инженерных стандартов. Создаёшь **конституцию проекта** и **сразу устанавливаешь** корневые правила для всех IDE. Код приложения не писать.

## Вход

- `AGENTS.md` в корне проекта (создан на шаге 00: блок протокола входа)
- `@witness-done/INPUT/TECH_SPEC.md`
- `@witness-done/OUTPUT/docs/01_analysis.md`
- `@witness-done/OUTPUT/docs/01_questions.md`
- `@witness-done/catalogs/antipatterns.md`
- `@witness-done/catalogs/language-policy.md`
- `@witness-done/TEMPLATES/constitution.md`
- `@witness-done/catalogs/stack-policy.md`
- `@witness-done/catalogs/design-input.md`
- `@witness-done/catalogs/typing-and-tests.md` (**типизация + автотесты**)
- `@witness-done/catalogs/verification-tax.md`
- `@witness-done/catalogs/agent-harness.md`
- `@witness-done/catalogs/agent-rules.md` (**один источник → адаптеры IDE**)
- `@witness-done/catalogs/context-rag.md`
- `@witness-done/catalogs/code-comments.md`
- `@witness-done/TEMPLATES/entry-protocol.md`
- `@witness-done/SEED/cursorrules.template.md`
- `@witness-done/SEED/cursorrules.baseline.md` (ориентир по стилю/жёсткости)
- `@witness-done/SEED/agent-config/manifest.json` (цели генерации)
- `OUTPUT/MANIFEST.md` → поле `PROJECT_ROOT`
- Если `design_input: present` — прочитай HTML из INPUT и создай черновик `OUTPUT/docs/design-notes.md` по `TEMPLATES/design-notes.md` (финализировать можно на 02 или уточнить на 08; **не позже 09**)

## Цель

Сделать так, чтобы любой новый чат в проекте — в Cursor, Claude Code, Codex, Gemini, Copilot,
Cline, Windsurf/Devin — сразу читал одни и те же правила, включая протокол входа.

## Создай файлы

### 1. `PROJECT_ROOT/AGENTS.md` — единственный источник правил

Полная конституция:

- роль агента;
- стек и версии (**решение команды по `stack-policy.md`**: язык, фреймворк, стили, infra — любые;
  выбор обоснован в ADR, запрещённых языков в каноне нет);
- язык документации: **русский** + глоссарий для аббревиатур (`language-policy.md`);
- source of truth;
- порядок работы;
- запреты (antipatterns);
- **запрет ярлыков неполноты:** объём не описывается словами «MVP», «PoC», «пока без…», `v1` как
  статус; `v1` — весь IN SCOPE, порядок работ — `S0…S8` (`catalogs/completeness-policy.md`);
- маленькие diff / PRODUCES-only / **SIZE_BUDGET** из D (`catalogs/completeness-policy.md`);
- security baseline;
- **обязательный lint**: после кода — команда из `OUTPUT/tooling/lint-setup.md` (конфиг на шаге 08);
- **дизайн:** если `design_input: present` — UI следует `OUTPUT/docs/design-notes.md`;
- **типизация и тесты:** `catalogs/typing-and-tests.md` — строгий режим выбранного языка (JS/TS → только TS strict), автотесты с каждым runtime PRODUCES;
- **CI/CD:** не деплоить prod из произвольного PR; см. `catalogs/cicd-environments.md` (детали на шаге 08);
- **progress.md** — читать в начале чата разработки; `done` только после **VerificationTax pre_ci** (`catalogs/verification-tax.md`) + evidence;
- **Agent Harness loop:** pack → код → `sp-verify --gate pre_ci` → progress (`catalogs/agent-harness.md`);
- **Вход:** протокол `status → intake → next → decide` (`catalogs/intake-and-decisions.md`);
- **CONTEXT_PACK only:** не читать весь OUTPUT (`catalogs/context-rag.md`);
- **FIT_CHECKS:** module / app / eco — не только unit;
- **комментарии в коде:** подробные, русский — `catalogs/code-comments.md`.

**Блок протокола входа не перезаписывается.** Он создан на шаге 00 между маркерами
`<!-- SP-ENTRY-PROTOCOL v1 -->` и `<!-- /SP-ENTRY-PROTOCOL -->` и остаётся **первым разделом**
файла. Конституция дописывается ниже. Если блока нет — вернись к шагу 00, не выдумывай новый.

Если в корне уже есть `AGENTS.md` с чужими правилами — сделай backup в
`OUTPUT/rules/previous/AGENTS.md` и перезапиши новым под текущий проект (сообщи об этом в чате),
сохранив блок протокола.

### 2. Адаптеры IDE — генерация, не ручная копия

```bash
node witness-done/SEED/sp-tools/sp.mjs rules --sync
node witness-done/SEED/sp-tools/sp.mjs rules --check   # exit 0
```

Создаются/обновляются `.cursorrules`, `.cursor/rules/witness-done.mdc`, `CLAUDE.md`, `GEMINI.md`,
`.github/copilot-instructions.md`, `.clinerules/witness-done.md`, `.devin/rules/witness-done.md`,
`.junie/guidelines.md`, `.kiro/steering/witness-done.md`, `.aider.conf.yml`, команды `/sp`.
Канон и карта целей — `catalogs/agent-rules.md`.

Правила:

- руками адаптеры не править: источник — `AGENTS.md`;
- `.rules` (Zed) **не создавать** — он затеняет `AGENTS.md`;
- `OUTPUT/rules/AGENTS.md`, `OUTPUT/rules/.cursorrules`, `OUTPUT/rules/cursor-rules.mdc`
  **не создаются**: их роль забрали корневые файлы.

### 3. `OUTPUT/rules/definition-of-done.md`

DoD: контракты, ошибки, тесты, **lint clean (error=0)**, authz, антипаттерны.

### 4. `OUTPUT/rules/INSTALL.md`

```text
Уже создано фабрикой (шаги 00 + 02):
  PROJECT_ROOT/AGENTS.md            ← источник правил
  PROJECT_ROOT/.cursorrules         ← копия (Cursor legacy / Cline / Zed)
  PROJECT_ROOT/CLAUDE.md            ← @AGENTS.md + протокол входа
  PROJECT_ROOT/GEMINI.md            ← копия
  PROJECT_ROOT/.github/copilot-instructions.md
  PROJECT_ROOT/.cursor/rules/witness-done.mdc
  PROJECT_ROOT/.clinerules/witness-done.md
  PROJECT_ROOT/.devin/rules/witness-done.md
  PROJECT_ROOT/.cursor/commands/sp.md (+ .claude/commands, .gemini/commands)

Появятся на шаге 08:
  PROJECT_ROOT/.eslintrc.js
  PROJECT_ROOT/eslint-plugin-local-rules/

Обновление после правки правил:
  node witness-done/SEED/sp-tools/sp.mjs rules --sync

Бэкапы перезаписанных файлов: OUTPUT/rules/previous/
```

### 5. `OUTPUT/rules/previous/`

Сюда складываются только перезаписанные файлы (например, прежний `AGENTS.md` или `.cursorrules`).
Пустой каталог не создавай — только когда есть что сохранить.

## Обнови MANIFEST + run log

- шаг 02 → `done`
- `AGENTS.md` (корень) → `done`
- `.cursorrules` → `done`
- `CLAUDE.md`, `GEMINI.md` → `done`
- `OUTPUT/rules/definition-of-done.md` → `done`

## STOP

```text
CONSTITUTION: OK
ROOT_AGENTS: written (protocol block preserved)
IDE_ADAPTERS: synced (sp rules --check → PASS)
DOO: written
Следующий шаг: PIPELINE/03_architecture.md
```
