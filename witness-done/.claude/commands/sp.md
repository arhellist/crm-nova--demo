# /sp — вход в Witness Done

Всё, что пришло этим сообщением — задача, вопрос или доработка — проходит через вход Witness Done.

## Шаги (по порядку, без пропусков)

1. **Запрос берётся дословно.** Текст после `/sp` — это запрос человека. Если текста нет —
   спроси одним вопросом, что нужно сделать, и остановись.
2. **Состояние.** Выполни:
   `node witness-done/SEED/sp-tools/sp.mjs status`
   Если CLI нет — прочитай `witness-done/OUTPUT/MANIFEST.md`, `witness-done/OUTPUT/roadmaps/progress.md`
   и `witness-done/spec-state/` руками.
3. **Запись входа.** Выполни:
   `node witness-done/SEED/sp-tools/sp.mjs intake "<запрос дословно>"`
   (при неоднозначности классификации CLI вернёт код 3 и два варианта — выбери вместе с человеком
   и повтори с `--kind`).
4. **Маршрут.** Покажи человеку `next:` из созданной записи `journal/intake/<ID>.md` в виде
   одной строки: «Дальше: …».
5. **Стоп.** Ничего не меняй в коде, пока маршрут не назван. Это не вежливость, а правило:
   правка без маршрута не попадёт ни в change-пакет, ни в D, значит её нельзя принять.

## Что делать дальше по маршруту

| `kind` | Маршрут |
|--------|---------|
| `new` | `PIPELINE/00_bootstrap.md` → волны A–C по `ORCHESTRATOR.md` |
| `question` | ответить по артефактам; решение → `sp decide "<решение>" --intake <ID>` |
| `change` | `PIPELINE/R02_propose_change.md` → R03 → R04 → R05 |
| `task` | `OUTPUT/prompts/Dxx_*.md` + `catalogs/agent-harness.md` |
| `bugfix` | `change` с причиной в `proposal.md`; код только по пакету |

## Два контекста

| Где вы | Путь к CLI | Журнал входа |
|--------|------------|--------------|
| проект с установленной фабрикой | `witness-done/SEED/sp-tools/sp.mjs` | `witness-done/OUTPUT/` |
| сам репозиторий фабрики (корень канона) | `SEED/sp-tools/sp.mjs` | `.witness-done-work/` |

Префикс `witness-done/` — это `<FACTORY_PATH>`, а не часть имени команды. В корне канона прогона
нет, поэтому `next:` ведёт на правку канона и `./validate.sh`, а не на `PIPELINE/00`.

## Запреты

- Отвечать на вопрос, меняя код: вопрос закрывается решением `DEC-###`, а не правкой.
- Заводить второй intake на тот же запрос: сначала `sp status`, потом `sp intake`.
- Объявлять работу готовой без `OUTPUT/evidence/` — слова «сделано» недостаточно.
- Молча выбирать вариант за человека, если `intake` вернул неоднозначность.

---

<!-- Служебное: файл копируется шагом 00 в .cursor/commands/sp.md, .claude/commands/sp.md
и (как TOML) в .gemini/commands/sp.toml по SEED/agent-config/manifest.json.
Канон: catalogs/intake-and-decisions.md. Правки — в этот файл, не в сгенерированные копии. -->
