# Правила агента: один источник, адаптеры IDE

> Канон Witness Done (правило действует с v1.14). Связан с `catalogs/intake-and-decisions.md`
> и `TEMPLATES/entry-protocol.md`.
> Цель: агент в любой IDE видит одни и те же правила и протокол входа, без ручной синхронизации.

## Что является источником

Единственный источник — `PROJECT_ROOT/AGENTS.md`. Он содержит:

1. блок `SP-ENTRY-PROTOCOL` (маркеры `<!-- SP-ENTRY-PROTOCOL v1 -->` … `<!-- /SP-ENTRY-PROTOCOL -->`);
2. конституцию проекта (появится на шаге 02).

Все остальные файлы правил — **генерация** из него. Править их руками нельзя: `sp rules --check`
сравнит содержимое с ожидаемым и вернёт `exit 2`.

`AGENTS.md` — открытый формат (Agentic AI Foundation, Linux Foundation). Его нативно читают
Codex, Cursor, Copilot, Cline, Devin/Windsurf, Junie, Kiro, Zed, Claude Code (с 2.1.277).
Поэтому он выбирается источником, а не `.cursorrules` или `CLAUDE.md`.

## Почему копия, а не указатель

Соблазн — положить в каждый файл одну строку «читай AGENTS.md». Это ломается на двух
инструментах:

- **Zed** читает первый найденный файл по списку `.rules` → `.cursorrules` → `.windsurfrules` →
  `.clinerules` → `.github/copilot-instructions.md` → `AGENT.md` → `AGENTS.md` → `CLAUDE.md` →
  `GEMINI.md` и **остальные игнорирует**. Указатель в `.cursorrules` затенил бы настоящие правила.
- **Claude Code** при существующем `CLAUDE.md` молча игнорирует `AGENTS.md`. Поэтому `CLAUDE.md`
  содержит `@AGENTS.md` — это официальный мост, а не указатель в пустоту.

Отсюда правило: **полная копия везде, где инструмент не умеет include**; include — только там,
где он документирован (Claude Code).

## Карта целей

| Файл | Инструмент | Режим | Обязателен |
|------|------------|-------|------------|
| `AGENTS.md` | Codex, Cursor, Copilot, Cline, Devin, Junie, Kiro, Zed (последним), Claude Code | источник | да |
| `.cursorrules` | Cursor (legacy), Cline, Zed (**первым**) | копия | да |
| `.cursor/rules/witness-done.mdc` | Cursor Project Rules | обёртка `alwaysApply: true` | да |
| `CLAUDE.md` | Claude Code | `@AGENTS.md` + блок протокола | да |
| `GEMINI.md` | Gemini CLI, Copilot CLI | копия | да |
| `.github/copilot-instructions.md` | GitHub Copilot | копия | да |
| `.clinerules/witness-done.md` | Cline | копия | да |
| `.devin/rules/witness-done.md` | Devin Desktop (Windsurf) | обёртка `trigger: always_on` | да |
| `.junie/guidelines.md` | Junie | копия | нет |
| `.kiro/steering/witness-done.md` | Kiro | обёртка `inclusion: always` | нет |
| `.aider.conf.yml` | Aider | `read: [AGENTS.md]` | нет |
| `.cursor/commands/sp.md` | Cursor `/sp` | копия `SEED/commands/sp.md` | да |
| `.claude/commands/sp.md` | Claude Code `/sp` | копия | нет |
| `.gemini/commands/sp.toml` | Gemini CLI `/sp` | TOML-обёртка | нет |

## Запрещённые файлы

| Файл | Почему нельзя |
|------|---------------|
| `.rules` | Zed прочитает его первым и проигнорирует `AGENTS.md` |
| `.windsurfrules` | устаревший формат; `.devin/rules/` покрывает тот же инструмент |
| `OUTPUT/rules/AGENTS.md` | вторая копия правил; живые правила только в корне проекта |
| `OUTPUT/rules/.cursorrules` | то же; в `OUTPUT/rules/` допустимы только `definition-of-done.md`, `INSTALL.md` и `previous/` |

## Команды

```bash
node witness-done/SEED/sp-tools/sp.mjs rules --list
node witness-done/SEED/sp-tools/sp.mjs rules --sync
node witness-done/SEED/sp-tools/sp.mjs rules --check
```

- `--list` — цели, режим, наличие файла, статус (`ok` / `missing` / `drift`).
- `--sync` — записать все цели; `--targets cursorrules,claude` ограничивает список.
- `--check` — сравнить фактические файлы с ожидаемым содержимым; `exit 2` при расхождении
  или отсутствии обязательной цели.

## Порядок записи

| Когда | Что | Почему |
|-------|-----|--------|
| Шаг 00 | `AGENTS.md` с одним блоком протокола + `sp rules --sync` | проект защищён с первого чата, конституции ещё нет |
| Шаг 02 | полная конституция в `AGENTS.md` + повторный `sp rules --sync` | адаптеры получают конституцию |
| Любая правка правил | править `AGENTS.md` → `sp rules --sync` | иначе `sp rules --check` и CI упадут |

## Новая цель

1. Добавить запись в `SEED/agent-config/manifest.json`: `id`, `path`, `mode`
   (`copy` | `wrapped` | `include` | `static` | `source` | `toml`), `required`, при необходимости
   `frontmatter`, `template`, `source`, `content`.
2. Если нужна обёртка — положить шаблон в `SEED/agent-config/templates/`.
3. Проверить `sp rules --sync` на тестовом проекте и добавить цель в `validate.sh`.
4. Обновить таблицу выше и `SEED/sp-tools/USAGE.md`.

## Предел

Синхронизация гарантирует, что **текст правил** одинаков. Она не гарантирует, что агент их
прочитал: инструмент может не поддерживать файл, у пользователя могут быть свои глобальные rules,
а `.cursorrules` в чужом репозитории может перебивать. Поэтому протокол входа продублирован в
самой команде `/sp` и в `sp status`, а не только в правилах.
