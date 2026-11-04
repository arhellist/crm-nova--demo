# Установка правил проекта

## Уже создано фабрикой (шаги 00 + 02)

```text
PROJECT_ROOT/AGENTS.md                        ← источник правил
PROJECT_ROOT/.cursorrules                     ← копия (Cursor legacy / Cline / Zed)
PROJECT_ROOT/CLAUDE.md                        ← @AGENTS.md + протокол входа
PROJECT_ROOT/GEMINI.md                        ← копия
PROJECT_ROOT/.github/copilot-instructions.md
PROJECT_ROOT/.cursor/rules/witness-done.mdc
PROJECT_ROOT/.clinerules/witness-done.md
PROJECT_ROOT/.devin/rules/witness-done.md
PROJECT_ROOT/.junie/guidelines.md
PROJECT_ROOT/.kiro/steering/witness-done.md
PROJECT_ROOT/.aider.conf.yml
PROJECT_ROOT/.cursor/commands/sp.md (+ .claude/commands, .gemini/commands)
PROJECT_ROOT/.git/hooks/pre-commit
```

## Появятся на шаге 08

```text
PROJECT_ROOT/.eslintrc.js
PROJECT_ROOT/eslint-plugin-local-rules/
PROJECT_ROOT/.github/workflows/ci.yml
```

## Обновление после правки правил

```bash
node witness-done/SEED/sp-tools/sp.mjs rules --sync
node witness-done/SEED/sp-tools/sp.mjs rules --check   # exit 0
```

Править адаптеры руками нельзя: любой дрейф ловится `rules --check` и валит CI.

## Бэкапы перезаписанных файлов

`OUTPUT/rules/previous/` — только если файл реально был перезаписан (в этом проекте таких нет:
корень был свободен от чужих правил).
