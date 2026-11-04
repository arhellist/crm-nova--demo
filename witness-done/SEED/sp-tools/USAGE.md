# sp-tools — Witness Done CLI (Node)

Канон: `catalogs/verification-tax.md`, `context-rag.md`, `agent-harness.md`, `contour-smoke.md`,
`catalogs/intake-and-decisions.md`, `catalogs/agent-rules.md`, `PIPELINE/10b_self_audit.md`.

> CLI называется только `sp-*`: `sp-tools/`, `sp.mjs`, `sp-verify.mjs`, `sp-retrieve.mjs`.
> Алиасов, переходных путей и shim-скриптов нет — фабрика рассчитана на новый проект с нуля,
> миграций не предусмотрено.
>
> В документации короткая форма `sp status` / `sp-verify …` означает
> `node witness-done/SEED/sp-tools/sp.mjs status`; копировать CLI в `scripts/sp-tools/` не нужно
> (DEC-034). В корне канона — `node SEED/sp-tools/sp.mjs status`.

## Команды

Из корня проекта (или с путём к фабрике):

```bash
node witness-done/SEED/sp-tools/sp.mjs --help
node witness-done/SEED/sp-tools/sp-retrieve.mjs --help
node witness-done/SEED/sp-tools/sp-verify.mjs --help
```

### sp — единый вход

| Подкоманда | Смысл |
|------------|--------|
| `status [--json]` | MODE, `last_completed_step`, профиль, активные `spec-state/changes/*`, `done` без evidence, открытые intake, следующий шаг |
| `intake "<запрос>" [--kind …] [--source chat\|issue\|doc]` | Создать `journal/intake/<YYYYMMDD-HHMM>-<slug>.md`: запрос цитатой, снимок состояния, классификация с обоснованием, `next:`. `--kind task` дополнительно пишет `<ID>-packet.md` из `TEMPLATES/spec-packet.md` |
| `next` | `next:` последней открытой записи входа, иначе resume из MANIFEST |
| `decide "<решение>" [--intake id] [--adr ADR-000N]` | Создать `journal/decisions/DEC-###-<slug>.md` (один файл — одно решение), пересобрать индекс и связать с записью входа |
| `close <intake-id> --ref <change-id\|Dxx\|DEC-###>` | Закрыть запись входа ссылкой на артефакт: для `DEC-###` запись должна существовать **и быть заполненной** |
| `journal [--init] [--index] [--check [--strict]] [--list] [--limit N] [--migrate]` | Журнал проекта `journal/`: создать, пересобрать оглавление, проверить (дубли `DEC`, битые ссылки, дрейф индекса), показать, перенести старый журнал из `OUTPUT/` |
| `review <Dxx> --verdict supports\|does_not_support\|unclear [--notes "…"] [--reviewer "…"]` | `OUTPUT/evidence/Dxx.review.json`: кто-то прочитал акт. Для `L2+` обязателен, `reviewer` ≠ `producer` |
| `progress [--merge] [--check]` | `OUTPUT/roadmaps/progress.md` производный от фрагментов `progress.d/Dxx.md`: собрать (`--merge`) или сверить (`--check`) |
| `feedback [--lite]` | `docs/feedback.md` (или `feedback-lite.md`: три вопроса) + `coverage_confidence` |
| `rules --list` | Цели адаптеров IDE и статус (`ok` / `missing` / `drift`) |
| `rules --sync [--targets id,id]` | Сгенерировать адаптеры из `AGENTS.md` (`SEED/agent-config/manifest.json`) |
| `rules --check` | Сверка с `AGENTS.md`; `exit 2` при расхождении обязательной цели или запрещённом файле |
| `doctor [--strict] [--staged] [--json]` | 7 проверок входа: правила и адаптеры, `next` у intake, `done` без акта, правки вне `PRODUCES`, `DEC-` без записи, чистота `INPUT/OUTPUT`, единственность `ORCHESTRATOR.md`. В корне канона проверяет канон — см. ниже |
| `update [--json] [--offline] [--no-cache] [--timeout мс]` | Сравнить `VERSION` фабрики с версией в репозитории (`SEED/update.json`). `exit 2` — есть новая версия, `exit 3` — проверить не удалось |
| `verify …` / `retrieve …` | Делегирование в `sp-verify.mjs` / `sp-retrieve.mjs` (без третьего CLI) |

Коды возврата: `0` — ok, `2` — провал проверки, `3` — нужен человек (неоднозначная классификация:
`sp intake` вернёт два варианта и попросит `--kind`).

#### Аргументы подкоманд `sp`

| Аргумент | Где | Что значит |
|----------|-----|------------|
| `"<запрос>"` | `intake` | Текст дословно, как его сформулировал человек; по нему восстанавливается намерение |
| `--kind new\|question\|change\|task\|bugfix` | `intake` | Явная классификация. Нужна при `exit 3` или когда контекст знает человек |
| `--source chat\|issue\|doc` | `intake` | Откуда пришёл запрос; по умолчанию `chat` |
| `"<решение>"` | `decide` | Формулировка выбора и причины, утвердительно |
| `--intake <ID>` | `decide` | К какой записи входа привязать `DEC-###`; проверяется существование |
| `--adr ADR-000N` | `decide` | Связать решение с архитектурной записью |
| `<ID>` | `close` | Имя файла в `journal/intake/` без `.md` |
| `--ref <change-id\|Dxx\|DEC-###>` | `close` | Артефакт-основание; проверяется, что он существует |
| `--targets id,id` | `rules --sync` | Ограничить набор целей адаптеров |
| `--verdict <v>` | `review` | `supports` \| `does_not_support` \| `unclear`; только `supports` пропускает акт |
| `--reviewer "…"` | `review` | Кто проверил; по умолчанию `SP_AGENT` или `git user.email`; не может совпадать с `producer` |
| `--notes "…"` | `review` | Что именно проверили |
| `--team` | `doctor` | Командный режим: `evidence_ref` у всех `done`, непустой review, без дублей `D` в `progress.d/` |
| `--merge` | `progress` | Собрать `progress.md` из фрагментов (конфликт — по `updated_at`, равенство — отказ) |
| `--check` | `progress` | Сверить `progress.md` с фрагментами; `exit 2` при расхождении или дубле |
| `--lite` | `feedback` | Три вопроса вместо шести секций |
| `--strict` | `doctor` | Предупреждения считать провалом (режим CI) |
| `--staged` | `doctor` | Проверять только файлы в индексе git (режим pre-commit) |
| `--offline` | `update` | Только кэш, без сети |
| `--no-cache` | `update` | Игнорировать кэш (TTL 24 ч) |
| `--timeout <мс>` | `update` | Таймаут HTTPS-запроса, по умолчанию 8000 |
| `--json` | все | Машинный вывод вместо человекочитаемого |
| `--root <путь>` | все | Корень проекта. По умолчанию: git-корень, иначе родитель `witness-done/`, иначе текущий каталог; явный флаг всегда приоритетен |
| `--factory <путь>` | все | Корень канона (по умолчанию `<root>/witness-done`, иначе каталог скрипта) |

Самопроверка CLI на одноразовых фикстурах (не трогает проект):

```bash
bash SEED/sp-tools/selftest.sh   # SELFTEST: PASS
```

### sp update — проверка обновлений фабрики

Версия фабрики — одна строка в `VERSION`. Удалённая версия берётся из репозитория, указанного
в `SEED/update.json` (`repo`, `branch`, `version_path`):

```bash
# update — сверить VERSION с репозиторием; обновление НЕ применяет, печатает шаги.
#   --no-cache       — игнорировать кэш (он живёт 24 ч)
#   --offline        — только кэш, без сети
#   --timeout <мс>   — таймаут HTTPS-запроса, по умолчанию 8000
#   --json           — машинный вывод
node witness-done/SEED/sp-tools/sp.mjs update
node witness-done/SEED/sp-tools/sp.mjs update --no-cache
node witness-done/SEED/sp-tools/sp.mjs update --offline
node witness-done/SEED/sp-tools/sp.mjs update --json
```

Порядок источников:

1. `git ls-remote --tags origin` — если фабрика установлена клоном. Берётся максимальный тег
   `vX.Y.Z`, файлы не скачиваются. Origin должен совпадать с `repo` из конфига (иначе ошибка,
   а не тихое сравнение с чужим репозиторием).
2. `https://raw.githubusercontent.com/<repo>/<branch>/VERSION` — если клона нет (установка
   копированием) или тегов нет. Один HTTPS-запрос, таймаут `--timeout` (по умолчанию 8 с).

Коды: `0` — актуально, `2` — доступно обновление, `3` — проверить не удалось (нет сети, пустой
репозиторий, нет `SEED/update.json`). «Неизвестно» не маскируется под «всё хорошо».

Кэш — `witness-done/.sp-cache/update.json` (в `.gitignore`), TTL 24 ч. `sp status` показывает строку
`Версия фабрики: <VERSION> (обновление: …)` **только из кэша** и никогда не ходит в сеть.

`update` не применяет обновление: обновление канона посреди прогона меняет шаблоны под уже
созданными артефактами. Команда печатает готовые шаги:

```bash
# установка клоном
git -C witness-done pull --ff-only
node SEED/sp-tools/sp.mjs rules --sync
node SEED/sp-tools/sp.mjs doctor --strict

# установка копированием — заменить канон, сохранив INPUT/ и OUTPUT/
```

В pre-commit эта проверка не входит: сеть в хуке означает падение коммита без интернета.

В самом репозитории канона журнал сопровождения пишется в `.witness-done-work/` — каталог в
`.gitignore`: канон поставляется копией, и чужие записи внутри него недопустимы. Заготовка
журнала для проектов лежит в `SEED/journal/` и поставляется **пустой**: заполненные примеры
означали бы, что в новый проект приехали чужие решения.

### Два контекста: проект и корень канона

| | Проект с установленной фабрикой | Сам репозиторий фабрики |
|---|---|---|
| Путь к CLI | `witness-done/SEED/sp-tools/sp.mjs` | `SEED/sp-tools/sp.mjs` |
| Журнал входа и решений | `journal/intake/`, `journal/decisions/`, индекс `journal/decisions.md` | `.witness-done-work/intake/`, `.witness-done-work/decisions/` |
| Журнал в git | **коммитится** (`journal/` в корне проекта) | не коммитится (`.witness-done-work/` в `.gitignore`) |
| `next:` для правки | `PIPELINE/...`, `R02_propose_change.md` | правка канона → `./validate.sh` |
| Гейт | `sp doctor --strict` | `./validate.sh` + `sp doctor --strict` (режим канона) |

`.witness-done-work/` — рабочий журнал мейнтейнера, он в `.gitignore` и в поставку не попадает:
`OUTPUT/` в репозитории обязан оставаться пустым, иначе `validate.sh` и `doctor` считают его
артефактом прошлого прогона.

`sp doctor` в корне канона не ищет `MANIFEST`, intake и evidence. Он проверяет: маркеры протокола
в `AGENTS.md`, 8 обязательных адаптеров IDE, пустой `OUTPUT/`, `VERSION` одной строкой `X.Y.Z`,
`SEED/update.json`, единственность `ORCHESTRATOR.md` и то, что `.witness-done-work/` не уедет в git.
Успех выглядит так:

```text
INFO адаптеров IDE: 8 обязательных
INFO режим: корень канона (проверки прогона пропущены; канон дополнительно проверяет ./validate.sh)
doctor: ok (strict) — корень канона
```

Классификация `intake` детерминированная:

| Условие | `kind` |
|---------|--------|
| нет `OUTPUT/MANIFEST.md` или `last_completed_step: —`, это проект | `new` |
| корень канона (root = фабрика, прогона нет) | `change` |
| в тексте `D\d\d` и `MODE: greenfield` | `task` |
| вопрос без глагола изменения | `question` |
| вопрос + глагол изменения | `exit 3` (нужен человек) |
| есть незакрытый `spec-state/changes/<id>` и запрос не вопрос | `change` |
| иначе brownfield | `change` |
| иначе greenfield | `task` |

Флаги разобраны по подкомандам в таблице «Аргументы подкоманд `sp`» выше; полный перечень всех
команд и флагов — `README.md` §11.

Полный цикл:

```bash
sp status                      # где стоит проект; аргументов нет
sp intake "Добавь экспорт отчёта в CSV"   # "…" — запрос дословно
sp next                        # маршрут из последней открытой записи
sp decide "Экспорт — CSV, не XLSX: клиент просит только CSV" --intake <ID>
#                          ^ решение утвердительно      ^ к какой записи привязать
# … работа по маршруту, пакет изменения, evidence …
sp close <ID> --ref add-report-export   # <ID> — запись входа, --ref — артефакт-основание
sp doctor --strict             # гейт входа; --strict = предупреждения тоже провал
```

### sp-retrieve

| Флаг | Смысл |
|------|--------|
| `--reindex` | Собрать/обновить `OUTPUT/context/index.md` из `OUTPUT` (specs/docs) и `spec-state/` (baseline, active changes) |
| `--d D03` | Привязка к D |
| `--pack P03` | Путь pack |
| `--validate` | Gate must_hit / deny / max_chunks → `Pxx.validation.json` (поддержка `OUTPUT/` и `spec-state/`) |
| `--query "…"` | Черновик кандидатов (keyword; embeddings — опционально позже) |
| `--out path` | Куда писать draft pack |
| `--root path` | PROJECT_ROOT (default: git-корень, иначе родитель `witness-done/`, иначе cwd) |
| `--factory path` | путь к witness-done (default: `./witness-done`) |

**Важно:** `--validate` **не создаёт** pack. Отсутствующий pack — это exit 2 и явная ошибка: набор
контекста собирается решением, а не самим валидатором (иначе проверка доказывает сама себя).
`must_hit` проверяется по строкам таблицы чанков, а не по тексту шаблона.

### sp-verify

| Флаг | Смысл |
|------|--------|
| `--d D03` | Проверить один D (читает FIT_CHECKS / VERIFICATION_TAX / ACCEPTANCE из промпта) |
| `--change <id>` | Идентификатор пакета изменения в `spec-state/changes/<id>` |
| `--batch N` | Пачка для `d-prompt-quality` (по 5 заданий, начиная с 1) |
| `--gate pre_ci` | Локальная приёмка до CI (по умолчанию, если `--gate` не указан): ACCEPTANCE по порогу уровня (`L1` ≥3, `L2/L3` 6–12), **связь «фраза ↔ тест»** (`@acceptance Axx.k`/ID в имени, утверждение, не skip, файл в `PRODUCES`, `binding_hash` в акте), blocker из `07_conflicts.md` в `conflicts_applied`, `out_of_produces` из `git status` |
| `--gate acceptance [--d Dxx]` | Строгая проверка связи: у фразы есть текст Given/When/Then, тест объявляет фразу, `tests/test-plan-Dxx.md` согласован с исходниками (план не называет чужой тест, ни одна фраза не пропущена) → `evidence/ACCEPTANCE[-Dxx].json` |
| `--gate change` | Приёмка изменения Brownfield: delta (ADDED/MODIFIED/REMOVED), ≥2 сценария, ссылки на baseline, обратная совместимость в `proposal.md`, чеклист `tasks.md`, lint/test runner → `OUTPUT/evidence/CHANGE-<id>.json` (`schema_version: 1`) |
| `--gate d-prompt-quality` | Качество тел заданий: HOW, INVARIANTS 5–12, ACCEPTANCE по уровню и префиксу, SIZE_BUDGET (`size_ok`, `produces_count ≤6`, surfaces ≤2, `delivery_slice`), PRODUCES ≤6, CONTEXT_PACK валиден, нет ярлыков неполноты (MVP/PoC/«пока без…»/`v1` как статус) → `evidence/prompt-quality-batch-N.json` |
| `--gate self-audit` | Шаг 10b: coverage без строк без D, `exit-criteria.md` с доказательствами, акты у `done` → `evidence/SELF_AUDIT.json` |
| `--gate product-smoke` | Runbook + smoke-скрипт существуют и зелёные → `evidence/RELEASE-product-smoke.json`; акт опечатан, несёт `code_hash`, `runtime.labels` и `script_sha256` (правка или удаление скрипта обнуляет прогон) |
| `--gate runtime-plan` | `OUTPUT/runtime/runtime-plan.json` полон: нет заглушек, `down[]` есть, каждая принятая `Axx` покрыта `cmd` или `na` с причиной → `evidence/RELEASE-runtime-plan.json`. Ничего не исполняет |
| `--gate runtime` | Исполняет план: `up` → `ready` → `seed` → `verify` → `down`; акт по каждой фразе → `evidence/RELEASE-runtime-verify.json`, автотрейс `Dxx.trace.json` при отсутствии внешнего. `--budget-min N` — бюджет на весь прогон; акт опечатан и привязан к `plan_hash`; свой автотрейс обновляется после смены кода |
| `--gate baseline` | R01: у каждого требования MUST/SHALL и ≥2 сценария (happy + negative/boundary) → `evidence/BASELINE.json` |
| `--gate pre_release` | Агрегат P0 + coverage + conflicts + acceptance_ids у done; каждый акт **сверяется с промптом** (устаревший или чужой не проходит); `progress.md` разобран без остатка; релизные акты опечатаны и привязаны к скрипту/плану |
| `--gate evidence-sync` | Узкая сверка `progress.md` ↔ `evidence/*.json`: `done` без акта, акт без строки, `tax_pass: true` при статусе не `done` → свой акт `evidence/EVIDENCE_SYNC.json` |
| `--root` / `--factory` | как выше |
| `--skip-commands` | Только структурные fit-checks / delta checks (без lint/test); акт помечается `commands_skipped: true`, релиз такой акт не принимает (кроме `L0`) |
| `--quick` | Алиас `--skip-commands`: быстрая итерация по структуре |
| `--base <ref>` | База diff для Plan-to-Proof (по умолчанию merge-base с `origin/main`, иначе `HEAD`) |
| `--gate spec-packet` | Минимальная полнота `journal/intake/<ID>-packet.md`: цель, non-goals, ≥3 критерия, evidence |
| `--intake <ID>` | Какой пакет проверять (`--gate spec-packet`) |
| `--verify-evidence <путь>` | Независимая проверка одного акта: `evidence_hash` + `code_hash` против текущего дерева; транскрипт создателя не нужен. `0`/`2` |

Evidence: `OUTPUT/evidence/Dxx.json`, `OUTPUT/evidence/CHANGE-<id>.json`, `RELEASE.json`,
`SELF_AUDIT.json`, `BASELINE.json`, `EVIDENCE_SYNC.json`, `prompt-quality-batch-N.json`.

**Acceptance contract**

- Парсит `## ACCEPTANCE` → пишет `fit.acceptance_ids` (`acceptance_source: "prompt"`).
- L1+: пустая таблица без `N/A` → `tax_pass: false`.
- L2/L3: в `app_contracts` обязателен ≥1 `METHOD /path`; пустой `ops_checked` больше не ok.
- `module` ищется в `07_module_plan.md`; отсутствие файла или модуля → `tax_pass: false`.
- `PRODUCES`: отсутствующий файл (L1+) → `tax_pass: false`; `conflicts_ref` без `conflicts_applied` — тоже.
- L3: `GATE` должен требовать подтверждения человеком.
- Гоняет lint/typecheck/test из `verify-commands.md`.

**Команда, approval и уверенность (правило действует с v1.21)**

- `progress.d/<Dxx>.md` + `sp progress --merge/--check`; `progress.md` помечен `merge=union`.
- `sp doctor --team`: `evidence_ref` у каждого `done`, review непустой и не устарел, нет дублей `D`.
- `--gate change` для `L3` требует `spec-state/changes/<id>/approval.json`
  (`approved_by`, `role`, `timestamp`, `evidence_refs`), `approved_by` ≠ автор изменения.
- `coverage_confidence` в `RELEASE.json` и `feedback.md`: `0.5·PRODUCES с актом + 0.3·Axx с тестами
  + 0.2·L3 с trace`; компонент с пустым знаменателем исключается и веса перераспределяются
  (проект без `L3` даёт `1.0` при полном покрытии). Число — оценка, `tax_pass` остаётся обязательным.
- `sp progress --check`: строка `done` без фрагмента — расхождение (`exit 2`), а не предупреждение.

**Plan-to-Proof и runtime trace (правило действует с v1.20)**

- `fit.plan` = `{ declared, touched, missing, extra, proof_debt }`; `touched` — diff от `--base` + untracked.
- `proof_debt` (= `extra`) валит `tax_pass` для `L1+`; без git — провал с `plan.note`, не «пропущено».
- `PRODUCES` понимает globs (`src/events/**`); glob раскрывается в конкретные файлы для diff,
  `produces_digest` и `out_of_produces`, поэтому правка файла под шаблоном меняет печать акта.
- `L3`: `runtime_trace_required` обязан быть назван явно (`yes` — по умолчанию, `no` — осознанный
  отказ); при `yes` — `evidence/Dxx.trace.json` (схема `TEMPLATES/runtime-trace.md`):
  `d`, `captured_at`, `source`, `entries[{type,ref,sha256?}]`; каждый `ref` существует.
- `trace.hash` входит в акт, `evidence_hash` покрывает его; `--verify-evidence` пересчитывает.

**Связь «фраза ACCEPTANCE ↔ тест» (правило действует с v1.27)**

- Фраза объявляется в тест-блоке: `// @acceptance A01.3` или ID в имени теста
  (`it('A01.3 — …')`). Договорённость «напиши номер в описании» стала входом гейта.
- Тест с объявленной фразой обязан содержать утверждение (`expect`/`assert`/`should`/
  `t.Error`/…), не быть пропущенным (`skip`/`todo`/`@Disabled`/`#[ignore]`/`t.Skip`) и лежать
  в файле из `PRODUCES`. Иначе `pre_ci`: «фраза без теста», «пустая связь», «пропущен».
- Ссылка на фразу, которой нет в `ACCEPTANCE`, — провал; освобождение только явное:
  `FIT_CHECKS → acceptance_ops` (попадает в акт как `fit.acceptance_binding.exempt`).
- `fit.acceptance_binding.binding_hash` — отпечаток текста фраз и закрывающих тестов.
  `pre_release` перепроверяет связь на текущем дереве: правка формулировки или удаление теста
  после приёмки = «связь изменилась, перегенерируй pre_ci».
- `--gate acceptance` дополнительно требует текст фразы и согласие `tests/test-plan-Dxx.md`
  с тестами; шаблон — `TEMPLATES/test-plan.md`.
- Предел назван прямо: смысл теста не проверяется, `expect(true).toBe(true)` формально проходит.
  Гейт доказывает наличие исполняемого утверждения, целостность ссылки и неизменность фразы.

**Fail-closed разбор (правило действует с v1.24)**

- `progress.md` читает один парсер (`progress-lib.mjs`): `done ✅`, `**D01**` — это `done`;
  нераспознанный статус, строка без `id`, дубль и пустая таблица — провал, а не пропуск.
- Glob один на фабрику: `src/**/*.ts` совпадает и с `src/index.ts` (ноль каталогов — законная глубина).
- `app_contracts` сверяет пару `METHOD /path` из контракта целиком.
- `review` без `code_hash` не принимается; `conflicts_ref` необязателен; `depends_done` понимает `D01-D02`.
- `L0` — docs/config-only: файл кода в `PRODUCES` или в diff — провал, а не снятие налога.
- `--verify-evidence` ловит акт, в котором заявлены отсутствующие файлы.
- Релизные акты проверяются как акты: `evidence_hash`, `code_hash`, метки, `script_sha256`, `plan_hash`.
- `sp rules --sync` пишет адаптеры в служебный список: `doctor --strict` не считает их кодом вне `PRODUCES`.

**Lite-режим (правило действует с v1.19)**

- `Режим прогона: lite` в `MANIFEST.md` или `SP_LITE=1`.
- `self-audit` и `pre_release` не требуют `coverage-matrix.md` и `exit-criteria.md`; `progress.md` и акты
  обязательны по-прежнему.
- `sp status` печатает `Режим: LITE`.
- Мелкая задача идёт через `sp intake --kind task` + `sp-verify --gate spec-packet`.

**Инварианты проекта (правило действует с v1.19)**

- Каталог `OUTPUT/docs/project-invariants.md`, шаблон `TEMPLATES/project-invariants.md`, канон `catalogs/invariants.md`.
- `pre_ci` выбирает `INV-###` по `module` из `FIT_CHECKS` и уровню; каждый выбранный обязан быть
  упомянут в `## INVARIANTS` задания. `invariants_skip: <причина>` снимает требование.
- Waiver с причиной и сроком освобождает; просроченный waiver — провал.
- `sp doctor` ловит дубли ID, waiver без причины/срока и ссылки на несуществующие `INV-###`.

**Целостность акта (правило действует с v1.18)**

- `evidence_hash` — SHA-256 акта без самого поля; пишется при записи, любая правка байтов ломает проверку.
- `code_hash` — `{ git_head, git_dirty, produces, produces_digest }`; `produces` — раскрытые пути,
  правка любого файла под glob меняет `produces_digest`.
- `git_head` — факт, не проверка: коммит акта сдвигает `HEAD`, поэтому равенство с `HEAD` не требуется.
- `producer` — `SP_AGENT` или `git user.email`; review от него самого не принимается.
- `L2+`: `evidence/Dxx.review.json` с `verdict: supports` обязателен для `tax_pass: true`.
- `pre_release` перепроверяет `evidence_hash` и `produces_digest` всех `done`; `--verify-evidence`
  делает то же для одного акта и сообщает `committed` (закоммичен ли акт и не изменён ли он).

## Зависимости

Чистый Node ≥18, без npm-пакетов. Команды lint/test берутся из `OUTPUT/tooling/verify-commands.md`.
