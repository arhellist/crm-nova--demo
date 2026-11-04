# Вход в проект: статус, intake, маршрут, решения

> Сгенерировано Witness Done v1.31.0. Канон: `witness-done/catalogs/intake-and-decisions.md`,
> `catalogs/agent-rules.md`.

## 1. Единый вход

```bash
node witness-done/SEED/sp-tools/sp.mjs status
node witness-done/SEED/sp-tools/sp.mjs intake "<запрос дословно>"
node witness-done/SEED/sp-tools/sp.mjs next
node witness-done/SEED/sp-tools/sp.mjs decide "<решение>" --intake <ID>
node witness-done/SEED/sp-tools/sp.mjs close <ID> --ref <Dxx|change|DEC-###>
```

| Шаг | Что делает | Куда пишет |
|-----|------------|-----------|
| `status` | где стоит прогон: MODE, шаг, активные changes, открытые intake, `done` без акта | только stdout |
| `intake` | запись входа цитатой, снимок состояния, `kind`, маршрут `next:` | `journal/intake/<ID>.md` |
| `next` | маршрут из последней открытой записи, иначе из `MANIFEST` | stdout |
| `decide` | решение `DEC-###` до кода | `journal/decisions/DEC-###-<slug>.md` + индекс |
| `close` | закрытие входа ссылкой на артефакт (проверяет evidence) | запись входа |

Коды выхода: `0` — ok, `1` — ошибка вызова, `2` — провал проверки, `3` — нужен человек.

## 2. Где живёт журнал

| Что | Путь | В git |
|-----|------|-------|
| Записи входа | `journal/intake/` | да |
| Решения | `journal/decisions/` | да |
| Индекс решений | `journal/decisions.md` | да (собирается `sp journal --index`) |

Журнал append-only: одна запись — один файл, конфликтов между ветками нет.

## 3. Классификация `kind`

| Условие | `kind` | Маршрут |
|---------|--------|---------|
| прогон не начат | `new` | `PIPELINE/00_bootstrap.md` |
| задание `Dxx` при greenfield | `task` | `OUTPUT/prompts/Dxx_*.md` |
| вопрос без глагола изменения | `question` | ответ + `sp decide` |
| вопрос и глагол изменения | `exit 3` | человек выбирает `--kind` |
| дефект при наличии принятого поведения | `bugfix` | `R02` с причиной в `proposal.md` |
| незакрытый change | `change` | `R02 → R05` |

## 4. Правила для агента

1. Не менять код, пока маршрут `next:` не назван.
2. Любой выбор, догадка, компромисс или конфликт контрактов — `sp decide` **до** кода.
3. Правила агента живут только в `AGENTS.md`; адаптеры — `sp rules --sync`.
4. `done` — только с `tax_pass: true` в акте.
5. Завершение — `sp close` со ссылкой на артефакт, а не словом «готово».

## 5. Проверки

```bash
node witness-done/SEED/sp-tools/sp.mjs rules --check     # exit 0
node witness-done/SEED/sp-tools/sp.mjs journal --check --strict
node witness-done/SEED/sp-tools/sp.mjs doctor --strict
```

pre-commit запускает `doctor --staged`; CI — `doctor --strict` и `evidence-sync`.
