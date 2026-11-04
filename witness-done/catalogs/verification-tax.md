# VerificationTax — контекстная приёмка фичи

> Канон Witness Done (правило действует с v1.10). Вшивается в constitution (02), D-промпты (09), tooling/`sp-verify` (08), assembly (10).  
> Цель: фича принимается **в контексте** module → app → eco, локально **до CI** и агрегированно **до релиза**.  
> `lint` / unit-тесты — только нижний слой (`unit`), не вся приёмка.

Не путать с налоговым ПО / QWED Tax.

## Глоссарий: `L0…L3`, «контур», «гейт» — это разные вещи

Три слова часто путают, и из-за этого спорят «какой level у задачи». Разведём явно:

| Слово | Что означает | Где живёт | Типичная ошибка |
|---|---|---|---|
| **Level `L0…L3`** | **строгость задания**: сколько и каких проверок оно требует | `## VERIFICATION_TAX` в D | «L2 — это уровень приложения в архитектуре» — нет, это строгость задачи |
| **Контур 1/2/3** | **точка приёмки**: где именно проверяем (после D / после группы / перед релизом) | таблица Contours ниже | «контур 2 = второй level» — нет, это wave-smoke |
| **Гейт** | **конкретный вызов** `sp-verify` с набором проверок | CLI `sp-verify --gate …` | «прошёл гейт» без указания, какой именно |

Соответствие простое: level задаёт **набор scopes**, контур задаёт **момент**, гейт — **команду**.
Один и тот же level может проходить разные контуры.

## Contours (три контура)

| Контур | Когда | Что |
|--------|--------|-----|
| **1. D** | после каждого runtime D | HOW + INVARIANTS + ACCEPTANCE + тесты `Axx.*` + `sp-verify --gate pre_ci` |
| **2. Wave** | после `split_group` / wave-marker | contour API-smoke затронутого контура (не весь продукт); см. `catalogs/contour-smoke.md` |
| **3. Release** | перед staging/prod promote | `sp-verify --gate pre_release` + полный product-smoke на staging |

L3 money / quotas / ledger: после pre_ci — **GATE human** (5–10 кликов) или скриптовый API-smoke только затронутых ops.

CI — **второй** прогон unit-контура на чистой машине, не первая приёмка и не замена wave/release.

## Scopes

| Scope | Вопрос | Источники правды |
|-------|--------|------------------|
| **unit** | Срез собирается и тестируется локально? | lint, typecheck, тесты из PRODUCES (= сценарии ACCEPTANCE) |
| **module** | Соблюдены контракт LIBRARY/gap и CONFLICTS? | `07_module_plan`, `07_conflicts`, `LIBRARY/<id>/SPEC`, PRIMARY module в D |
| **app** | Стык с контрактами приложения и соседними D? | `OUTPUT/specs/*`, ops из FIT_CHECKS, `ЗАВИСИТ ОТ`, progress |
| **eco** | Платформенные / NFR / антипаттерн-инварианты? | logging, rate-limit, ADR, nfr, design-notes, antipatterns, cicd envs |

## Gates

| Gate | Когда | Смысл |
|------|--------|--------|
| **pre_ci** | После каждого runtime D, **до** push/CI | Все required scopes для level + acceptance contract; пишет `OUTPUT/evidence/Dxx.json` |
| **pre_release** | Перед staging/prod promote | Все P0 D = done + evidence с `acceptance_ids`; coverage P0 без `missing`; CONFLICTS blockers = 0; ops у L2/L3 |

## Levels × scopes

| Level | Типичный D | Обязательно до `done` |
|-------|------------|------------------------|
| L0 | docs-only | paths PRODUCES существуют; ACCEPTANCE может быть `N/A` |
| L1 | тонкий runtime | unit + module + app + **≥3 Axx** → **pre_ci** |
| L2 | API / UI / domain | L1 + ≥1 `METHOD /path` в app_contracts + **6–12 Axx** + eco baseline → **pre_ci** |
| L3 | security / payments / quotas / ledger | L2 + eco full + **GATE: human confirm** + участие в **pre_release** |

## FIT_CHECKS (в каждом D)

Блок `## FIT_CHECKS` в D (см. `TEMPLATES/dev-prompt.md`) заполняется на шаге 09 из CONSUMES, PRIMARY LIBRARY, coverage-matrix, conflicts — **не выдумывать** eco_invariants.

Минимум полей: `module`, `app_contracts`, `depends_done`, `eco_invariants`, `pre_ci`, `pre_release`.

**app_contracts (v1.10):** у L2/L3 — конкретные `METHOD /path` (и при необходимости entity ids). Пустой список / только словесное «publish fee» **запрещён** — `sp-verify` ставит `tax_pass: false`.

## Acceptance contract (v1.10, связь с тестом — v1.27)

Каждый runtime D содержит `## HOW`, `## INVARIANTS`, `## ACCEPTANCE` (таблица Given/When/Then с ID `Axx.k`).

`sp-verify --gate pre_ci`:

1. Парсит ACCEPTANCE → пишет `fit.acceptance_ids` (`acceptance_source: "prompt"`) и проверяет порог уровня; на `pre_release`/`self-audit` список повторно сверяется с промптом — акт от другой редакции задания не проходит.
2. L1+ без ID и без явного `N/A` → fail.
3. L2/L3 без `METHOD /path` в app_contracts → fail.
4. Проверяет **связь «фраза ↔ тест»** (v1.27, `DEC-027`, `acceptance-bind.mjs`).
5. Гоняет lint/typecheck/test.

### Связь «фраза ↔ тест» (v1.27)

Фраза приёмки существует не сама по себе: у неё есть исполняемое утверждение в коде, и это
проверяется машинно, а не по договорённости «номер фразы напиши в описании теста».

| Что проверяется | Как | Провал |
|---|---|---|
| фраза объявлена тестом | `// @acceptance A01.3` в тест-блоке **или** ID в имени теста (`it('A01.3 — …')`) | `фраза A01.3 без теста` |
| тест что-то утверждает | в блоке есть `expect`/`assert`/`should`/`t.Error`/… | `объявил A01.3, но утверждения в нём нет` |
| тест не отключён | нет `skip`/`todo`/`@Disabled`/`#[ignore]`/`t.Skip` | `объявил A01.3, но пропущен` |
| ссылка не висит | `Axx.k` есть в ACCEPTANCE задания | `ссылается на A01.9 — такой фразы нет` |
| тест принадлежит заданию | файл заявлен в `PRODUCES` | фраза остаётся без теста |
| фраза не подменена | `binding_hash` в акте = отпечаток фраз + тестов | `pre_release`: `связь фраз и тестов изменилась` |

Тест-блок определяется по объявлениям семейств языков (JS/TS `it|test`, Python `def test_`,
Go `func Test`, Java `@Test`, Rust `#[test]`, PHP `test*`, Ruby `it`, Elixir `test`); незнакомый
язык разбирается как один блок на файл — грубее, но без молчаливого пропуска.

**`acceptance_ops`** в `FIT_CHECKS` — единственный способ снять фразу с кодового теста: перечислить
её ID (например, проверяется только внешним контуром). ID всё равно обязан быть в ACCEPTANCE,
а освобождение попадает в акт (`fit.acceptance_binding.exempt`).

**Гейт `acceptance`** (`sp-verify --gate acceptance [--d Dxx]`) — то же плюс два требования,
которых нет в `pre_ci`: у фразы есть текст (Given/When/Then, а не голый номер), и
`OUTPUT/tests/test-plan-Dxx.md` согласован с исходниками — план не может называть тест,
который фразу не объявляет, и не может пропустить фразу.

**Честный предел.** Гейт **не** доказывает, что тест проверяет смысл фразы: `expect(true).toBe(true)`
формально проходит. Он гарантирует, что у фразы есть исполняемое утверждение в заявленном файле,
что ссылка не висит в пустоте, что тест включён и что фразу не переписали после приёмки.
Совпадение смысла — обязанность автора и ревьюера (`sp review`), и это записано прямо, а не
выдаётся за проверку.


## Evidence

- JSON: `OUTPUT/evidence/Dxx.json` (схема в `TEMPLATES/evidence.md`)
- Обязательные поля fit: `ops_checked`, `acceptance_ids`, `acceptance_source`
- Человекочитаемый дубль опционален: `OUTPUT/evidence/Dxx.md`
- `progress.md` → `done` **запрещён** без `tax_pass: true`, `gate: pre_ci` и (L1+) `acceptance_ids` в пределах порога уровня (`N/A` — только `L0`)
- `producer` — кто создал акт (`SP_AGENT`, иначе `git config user.email`)
- `code_hash` — `{ git_head, git_dirty, produces, produces_digest }`: коммит, флаг незакоммиченных правок и SHA-256 содержимого `PRODUCES`
- `produces` в акте — **раскрытые** пути: glob (`src/events/**`) превращается в конкретные файлы до хеширования, иначе `produces_digest` не менялся бы при правке кода
- `git_head` — факт «на каком коммите писался акт», не проверка: коммит самого акта сдвигает `HEAD`, поэтому равенство с текущим `HEAD` ничего не доказывает
- `evidence_hash` — SHA-256 акта без самого поля; пишет CLI, руками не правится
- `commands_skipped` — `true`, если акт снят структурно (`--skip-commands`, `--quick`; у `L0` — всегда).
  Для `L1+` такой акт законен как быстрая итерация, но `pre_release` его не принимает: линт, типы и
  тесты не гонялись. У `L0` команд нет по уровню, поэтому структурный акт — норма, а не пропуск
- Акт, в котором заявлен файл `PRODUCES`, отсутствующий на диске, — провал: иначе `produces_digest`
  сходится сам с собой, и «сделано» подтверждает пустоту
- Акты `done` перепроверяются `sp-verify --verify-evidence <путь>`: `evidence_hash`, `produces_digest` и чистота файла акта в git. `committed: false` — черновик, историей не подтверждён; закоммиченный, но изменённый акт — провал

## Fail-closed разбор (правило действует с v1.24)

Гейт, который не смог разобрать вход, падает. «Не понял» ≠ «пропустил». Один разбор на всю фабрику:

- `progress.md` читает `progress-lib.mjs` — и `sp`, и `sp-verify`, и `pre_release`. `done ✅`,
  `**D01**` и `done (10b)` — это `done`; нераспознанный статус, строка со статусом без `id`,
  дубль `D`, пустая таблица — issue, а не тишина.
- Glob один на фабрику (`evidence-lib.mjs`): `src/**/*.ts` совпадает и с `src/index.ts` — ноль
  каталогов тоже законная глубина. Раньше такой файл не попадал ни в diff, ни в `produces_digest`.
- `app_contracts` сверяет пару `METHOD /path` из OpenAPI целиком. Подстрока «где-то был `get:`,
  где-то `/orders`» больше не считается совпадением.
- `review` без `code_hash` не принимается: иначе старый отзыв подтверждал бы любой следующий акт.
- `conflicts_ref` необязателен: отсутствие поля означает «конфликтов нет». `none`, `—`, `-`, `нет`
  распознаются только целиком; пустая строка больше не выглядит как заданное поле.
- `depends_done` понимает `D01, D02`, `D01 D02` и диапазон `D01-D02`; неразобранный токен
  остаётся в списке и валит гейт.
- Открытый `blocker` ищется построчно в таблице `07_conflicts.md`, а не по совпадению слов в разных абзацах.
- `L0` проверяется на то, чем он обязан быть: docs/config-only. Файл кода в `PRODUCES` или в
  тронутом diff — провал с требованием поднять уровень.
- `evidence-sync` — свой узкий гейт (`EVIDENCE_SYNC.json`), а не псевдоним `pre_release`.

## Plan-to-Proof (правило действует с v1.20)

- `pre_ci` сверяет `PRODUCES` с фактическим diff (`--base`, по умолчанию merge-base с `origin/main`, иначе `HEAD`) плюс untracked — **в обе стороны**:
  - `plan.touched` — что реально тронуто (служебные каталоги исключены);
  - `plan.missing` — заявлено, но не тронуто/нет файла (факт для чтения, не провал);
  - `plan.extra` — тронуто, но не заявлено;
  - `plan.proof_debt` = `extra` — **провал** `tax_pass` для `L1+`.
- `PRODUCES` понимает globs (`src/events/**`): существование проверяется наличием хотя бы одного файла, а для diff, `produces_digest` и `out_of_produces` glob раскрывается в те же конкретные файлы (DEC-015). `**/` означает «ноль или больше каталогов»: `src/**/*.ts` обязан совпадать с `src/index.ts`.
- Нет git для `L1+` — провал с явным сообщением (`plan.note`), а не молчаливое «пропущено».
- `out_of_produces` остаётся как факт для чтения и считается по раскрытым файлам: файл под glob-шаблоном в него не попадает. Это подмножество `proof_debt`: провал объясняется списком.

## Runtime trace (L3, правило действует с v1.20)

- `FIT_CHECKS.runtime_trace_required: yes` → обязателен `OUTPUT/evidence/Dxx.trace.json` (схема — `TEMPLATES/runtime-trace.md`). Для `L3` поле обязано быть названо явно: `yes` — по умолчанию, `no` — только осознанный отказ; `d-prompt-quality` не пропускает `L3` без этого поля.
- Проверяется: `d` совпадает, `captured_at` ISO-8601, `source` непустой, `entries` ≥1, `type` из
  `api_response|console_log|screenshot`, каждый `ref` существует, `sha256` при наличии совпадает.
- Проверяется привязка к коду: `commit` совпадает с `git HEAD` (трейс от другого кода — провал),
  `code_hash.produces_digest` совпадает с дайджестом `PRODUCES` принятого задания. Трейс без этих
  полей не принимается: форма без привязки ничего не доказывает (`DEC-019`).
- Хеш файла трейса входит в акт (`trace.hash`) и покрывается `evidence_hash`; `--verify-evidence`
  пересчитывает его — подмена трейса после приёмки видна.
- Артефакт приходит **снаружи** либо **порождается фабрикой** прогоном плана: `sp-verify --gate runtime`
  пишет трейс с `commit`, `code_hash` и `produced_by.plan_hash`, если внешнего файла нет.
  Свой автотрейс (`produced_by.tool == 'sp-verify'`) перезаписывается при повторном прогоне после
  смены кода; трейс, снятый человеком, не трогается никогда.
- Личность CI не удостоверяется (нет ключа подписи): автотрейс говорит «команда прогнана фабрикой
  на этом коде и вернула этот код выхода», но не «оракул в `verify[]` правильный».

## Runtime plan (L2+, правило действует с v1.23)

- `OUTPUT/runtime/runtime-plan.json` — исполняемый контракт окружения: `stack`, `up[]` с `ready`,
  `seed[]` (`idempotent: true`), `down[]`, `verify[]` по фразам `Axx.k`.
- План собирается на шаге 08 из входов прогона (`architecture`, `04_data_and_api`, `nfr`,
  `env-vars`, `01_contract.md`). Плейсхолдеры (`{{...}}`, `TODO`, `<...>`) — провал гейта.
- `--gate runtime-plan` — статика: заглушки, teardown, фантомные метки (сверка с `01_contract.md`),
  полнота по `acceptance_ids` принятых заданий. Непокрытая принятая фраза — провал: либо `cmd`,
  либо `na` с `reason`.
- `--gate runtime` — исполнение: `up` → `ready` (поллинг) → `seed` → `verify` → `down` (всегда).
  Акт `RELEASE-runtime-verify.json`: результат по каждой фразе, логи, `uncovered`, `plan_hash`,
  `evidence_hash`. `--budget-min` — бюджет на **весь** прогон: остаток передаётся в таймаут каждой
  команды, а не начинается заново.
- `pre_release` требует исполненный акт, если файл плана существует: акт должен быть исполнен
  (`executed: true`), опечатан, нести список `verify`, `down` и совпадать с планом по `plan_hash`.
  Правка плана после прогона обнуляет доказательство.
- Проект без runtime-кода план не создаёт; появление `PRODUCES` делает его обязательным
  (`sp doctor` это проверяет).

## Командный прогресс (правило действует с v1.21)

- `OUTPUT/roadmaps/progress.d/<Dxx>.md` — фрагмент на задание; `progress.md` собирается `sp progress --merge`.
- Один `D` — один фрагмент. Дубль в двух фрагментах — провал `sp progress --check` и `sp doctor --team`.
- Конфликт фрагментов решается более новым `updated_at`; равные или отсутствующие — отказ со списком.
- У `done` обязателен `evidence_ref`: без него `sp doctor --team` не пропускает.
- `progress.md` получает `merge=union` в `.gitattributes`: мерж не теряет строки.

## Approval для L3 (правило действует с v1.21)

- Пакет изменения `L3` требует `spec-state/changes/<id>/approval.json`:
  `{ approved_by, role, timestamp, evidence_refs }`.
- `--gate change` проверяет: файл есть, поля непустые, `timestamp` ISO-8601,
  `evidence_refs` непустой и каждый путь существует, `approved_by` ≠ автор изменения.
- Уровень берётся из `proposal.md`: `| level | L3 |`.
- **Предел:** approval доказывает, что подтверждение названо и отделено от автора, а не то, что
  подтверждающий вправе подтверждать.

## Уверенность (правило действует с v1.21)

`coverage_confidence` в `RELEASE.json` и `feedback.md`:

```
0.5 × доля PRODUCES с актом + 0.3 × доля Axx, упомянутых в тестах + 0.2 × доля L3 с trace
```

- `PRODUCES` входит в знаменатель раскрытыми файлами: glob-запись не выпадает из оценки.
- Знаменатель нулевой → компонент **исключается**, а веса перераспределяются между определёнными
  (DEC-017). Проект без `L3` не упирается в `0.8`: полное покрытие даёт `1.0`.
  Если определены все три — веса прежние `0.5 / 0.3 / 0.2`.
- Метка остаточного риска: `низкий` (≥0.85), `средний` (≥0.6), `высокий` (<0.6).
- Это **оценка**, а не замена `tax_pass`: она показывает, насколько доказательства покрывают
  заявленное, и не отменяет ни одного гейта.

## Review-артефакт (L2+)

- `OUTPUT/evidence/Dxx.review.json` — кто-то прочитал акт и подтвердил его, а не только посчитал
- Пишет `sp review Dxx --verdict supports|does_not_support|unclear`; `--reviewer` ≠ `producer`
- Привязан к `code_hash.produces_digest` и набору `acceptance_ids`, **не** к байтам акта:
  повторный `pre_ci` не обесценивает review, а правка кода — да, включая файлы под glob-шаблоном
- `reviewer` — самодекларируемая строка, не подпись: проверка `reviewer ≠ producer` исключает
  случайное самоодобрение, но не подлог
- Для `L2+` отсутствие review или вердикт ≠ `supports` → `tax_pass: false`
- **Предел:** review не доказывает компетентность ревьюера. Он доказывает, что акт кто-то
  прочитал и подтвердил именно этот код; независимость проверяется только по `reviewer ≠ producer`

## Что проверяет `sp-verify` (кратко)

| Scope | Автомат |
|-------|---------|
| unit | lint + typecheck + tests PRODUCES |
| module | PRIMARY module / gap; **hard fail**, если модуль не найден в `07_module_plan.md`; mitigations из conflicts |
| app | ops из FIT_CHECKS в specs: пара `METHOD /path` сверяется целиком; deps `done` (диапазон `D01-D02` разворачивается); L2/L3 ops непустые |
| produces | `PRODUCES` существует; отсутствие файла = `tax_pass: false` (L1+); заявленный, но отсутствующий файл в акте — провал |
| level L0 | docs/config-only: ни файла кода в `PRODUCES`, ни файла кода в тронутом diff; `ACCEPTANCE` — `N/A` с причиной или `Axx` |
| conflicts | `conflicts_ref: none` или `conflicts_applied` заполнен; blocker из `07_conflicts.md` обязан быть в `conflicts_applied` |
| acceptance (порог) | `pre_ci` применяет тот же порог, что `d-prompt-quality`: `L1` ≥3 `Axx`, `L2/L3` 6–12; `N/A` только для `L0` |
| acceptance (связь) | `pre_ci`: каждая фраза объявлена тестом (`@acceptance`/ID в имени), тест содержит утверждение, не пропущен и заявлен в `PRODUCES`; `binding_hash` в акте; `pre_release` перепроверяет на текущем дереве |
| acceptance (план) | `--gate acceptance`: текст фразы + согласие `tests/test-plan-Dxx.md` с тестами (план не называет чужой тест, ни одна фраза не пропущена) |
| out_of_produces | `pre_ci` заполняет поле из `git status` против `PRODUCES`; жёсткий гейт по изменённым файлам — `sp doctor` |
| review | `L2+`: `evidence/Dxx.review.json` есть, `verdict: supports`, `reviewer` ≠ `producer`, `code_hash.produces_digest` присутствует и совпадает |
| proof_debt | `L1+`: тронутые файлы вне `PRODUCES` и вне служебных каталогов (включая адаптеры `sp rules --sync`) валят `tax_pass`; без git — провал |
| trace | `L3`: поле `runtime_trace_required` названо явно; при `yes` — `evidence/Dxx.trace.json` валиден, `ref` существуют, хеш в акте |
| approval | `L3`-изменение: `approval.json` с ролью и доказательствами, `approved_by` ≠ автор |
| team | `progress.d/`: дубли `D`, `evidence_ref` у `done`, непустые и свежие review |
| evidence_hash | `pre_release`: у каждого `done` и у обоих релизных актов печать сходится, `code_hash` соответствует текущему дереву, `commands_skipped` не `true` (для `L0` структурный акт законен) |
| progress | один парсер таблицы: `done ✅` — это `done`, нераспознанный статус / строка без `id` / пустая таблица — провал |
| acceptance | ID из промпта → evidence (структура) + связь «фраза ↔ тест» (`binding_hash`) |
| acceptance (план) | `--gate acceptance`: текст фразы + `tests/test-plan-Dxx.md` = тесты |
| eco | platform include; нет секретов; antipatterns; design-notes если UI |
| pre_ci | все required scopes level + acceptance + structural issues пусты |
| pre_release | агрегат P0 + coverage + conflicts + acceptance_ids у done + исполненный runtime + опечатанный product-smoke |
| evidence-sync | `progress.md` ↔ `evidence/*.json`: `done` без акта, акт без строки, `tax_pass: true` при статусе не `done` |
| `d-prompt-quality` | HOW / INVARIANTS 5–12 / ACCEPTANCE порог / SIZE_BUDGET / PRODUCES ≤6 / CONTEXT_PACK valid / нет ярлыков неполноты (`catalogs/completeness-policy.md`); батчи ≤5 (`--batch N`) |
| `baseline` | R01: MUST/SHALL + ≥2 сценария (happy + negative/boundary) на требование |
| `self-audit` | 10b: coverage без строк без D, exit-criteria с доказательствами, evidence у `done` |
| `product-smoke` | runbook + smoke-скрипт существуют и зелёные; акт опечатан, несёт `code_hash`, `runtime.labels` и `script_sha256` (правка или удаление скрипта обнуляет акт) |

Интеграционный smoke (контур 2): только **затронутые** ops — `catalogs/contour-smoke.md`, не полный e2e на каждый D.

## Запреты

- Ставить `done` после «тесты зелёные», игнорируя module/app/eco / acceptance_ids
- Считать CI единственной приёмкой
- Полный e2e на каждый D
- Пустой FIT_CHECKS / пустой `app_contracts` у L2/L3
- Evidence «для галочки» с `ops_checked: []` на L2/L3
- L3 money/quota с `GATE: none`
- Review, написанный автором акта, и «подтверждено» без `sp review`
- «Сделал заодно» файл вне `PRODUCES` — это `proof_debt`, а не инициатива
- Принимать `evidence/Dxx.trace.json`, не открывая его: форма проверена, смысл — нет
- Релизить акт, снятый с `--skip-commands`: зелёная печать на непроверенном коде — это ложный пропуск
- Подменять релизный акт файлом `{"tax_pass": true}`: релиз требует печать, `code_hash`, метки и привязку к скрипту/плану
