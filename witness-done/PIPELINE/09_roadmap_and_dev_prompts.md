# PIPELINE 09 — Roadmap & Dev Prompt Chain (полная покрытие продукта)

## Роль

Tech lead + prompt engineer. Документация + план модулей → **тонкие D-промпты в SIZE_BUDGET**, которые покрывают весь IN SCOPE, + тест-планы + матрица покрытия.

## Вход

- `OUTPUT/docs/*`, `specs/*`, `security/*`, `rules/*`
- **`OUTPUT/docs/07_module_plan.md`**, `07_conflicts.md`, `07_methodology_apply.md`, опционально `07_gap_*.md`
- `@witness-done/LIBRARY/*/SPEC.md` — только include/adapt (читать из LIBRARY)
- `@witness-done/TEMPLATES/dev-prompt.md`, `roadmap.md`, `progress.md`, **`coverage-matrix.md`**
- `@witness-done/TEMPLATES/context-pack.md`, `context-index.md`, `evidence.md`
- `@witness-done/catalogs/completeness-policy.md` (**обязательно**, SIZE_BUDGET)
- `@witness-done/catalogs/typing-and-tests.md` (**типы + автотесты в каждом D**)
- `@witness-done/catalogs/verification-tax.md`
- `@witness-done/catalogs/contour-smoke.md`
- `@witness-done/catalogs/context-rag.md`
- `@witness-done/catalogs/agent-harness.md`
- `@witness-done/catalogs/code-comments.md`
- `@witness-done/catalogs/design-input.md`
- `OUTPUT/docs/design-notes.md` — если design present
- `OUTPUT/tooling/cicd-and-environments.md`, `deploy.md`
- antipatterns, nfr-work-items, `@witness-done/VERSION`
- `INPUT/TECH_SPEC.md` §2 / §4 / §12 — для трассировки
- Черновик срезов из `OUTPUT/docs/01_analysis.md` (если есть)

Если `07_module_plan.md` нет или в `07_conflicts.md` есть blocker — **STOP**, вернись к шагу 07.  
Если нет `cicd-and-environments.md` — **STOP**, вернись к шагу 08.

## Принципы

1. **Полнота:** каждый пункт IN SCOPE и каждый P0-сценарий → D (см. completeness-policy). Не оставлять «сделают потом» без строки в coverage-matrix.
2. **SIZE_BUDGET жёсткий:** OVER_BUDGET → сплит до записи тела. Полнота = цепочка тонких D, не один толстый.
3. **Без ярлыков неполноты:** ни в roadmap, ни в D-промптах объём не описывается как «MVP», «PoC»,
   «beta», «пока без…»; `v1` — это весь IN SCOPE, а порядок работ — `S0…S8`/волны
   (`catalogs/completeness-policy.md`). Гейт `d-prompt-quality` валит D с ярлыком.
4. Вертикальные срезы; платформа → auth → домен → интеграции → hardening.
5. CONSUMES модулей: **`LIBRARY/<id>/SPEC.md`** + `07_module_plan.md`, **не** `OUTPUT/library/`.
6. Gaps → отдельный D или явная секция; UI-D CONSUMES `design-notes.md` если дизайн есть.
7. Mobile в IN SCOPE + ADR pending → `blocked_adr` + **заготовки будущих D** (номер+цель+CONSUMES), не тишина.
8. D01/D11 CONSUMES включают cicd/deploy; D01 **без** доменной фичи.
9. Каждый D: PRE-CHECK / STOP / обновление progress / блок SIZE_BUDGET.
10. **Типы + тесты:** в каждом D с runtime-кодом — PRODUCES включает тесты; ОГРАНИЧЕНИЯ ссылают `typing-and-tests.md`; чеклист: lint + typecheck + test green.
11. **Lean body:** CONSUMES с якорями; ≤12 доменных буллетов; не копировать specs целиком.
12. **CONTEXT_PACK + FIT_CHECKS + VERIFICATION_TAX** в каждом D (шаблоны + catalogs v1.10).
13. Pack без `validation.ok` не привязывать к D.
13. **HOW + INVARIANTS + ACCEPTANCE** в каждом runtime D (L0: `N/A` + причина). Тесты = сценарии Axx, не «функция вызвалась».
14. **Decision lock:** запрещены «зафиксировать позже», «если API есть», «на усмотрение» без выбранной схемы в HOW/INVARIANTS. Дыра → дописать specs (04) или `blocked_adr`, не отдавать агенту на выдумку.
15. **Cross-D contracts:** если D_n читает ключи/reasons/схему D_m — shared snapshot/fixture test + кейс в ACCEPTANCE; wire-стыки — явный шаг HOW + A-кейс.
16. **api+ui** в одном D — по умолчанию сплит (completeness-policy); wave-marker в `split_group` для contour smoke.
17. L3 money/quotas/ledger → `GATE: human confirm before coding`.

## Подволны шага 09 (обязательно при оркестраторе)

| Подволна | Что создать | STOP при раздутом контексте |
|----------|-------------|------------------------------|
| **C1** | overview, dependency-graph, progress (каркас), coverage-matrix, **`d-cut-list.md`**, черновик **`OUTPUT/context/index.md`** — **без** полных тел D | `продолжай C2 batch 1` |
| **C2** | тела `OUTPUT/prompts/D*.md` + **`OUTPUT/context/packs/P*.md`** (+ validation) **батчами ≤ 5** | `продолжай C2 batch N` |
| **C3** | `tests/test-plan-Dxx.md`, `tests/INDEX.md`, `improvement-backlog.md`; затем шаг 10 | `продолжай волну C` / шаг 10 |

В MANIFEST фиксируй `c_subwave: C1|C2|C3` и `c2_batch` при необходимости.

## Процедура нарезки (до тел D)

### A. D-cut list → `OUTPUT/roadmaps/d-cut-list.md`

Из `01_analysis` (черновые срезы) + `07_module_plan` + ТЗ §2/§4 собери таблицу кандидатов:

| Candidate | ЦЕЛЬ (черновик) | delivery_slice | surfaces | entity | est_produces | PRIMARY LIBRARY | budget | split_to |
|-----------|-----------------|----------------|----------|--------|--------------|-----------------|--------|----------|
| … | … | S1 | db,api | Order | 5 | — | OK \| OVER | D03,D04 |

`delivery_slice` (`S0…S5` или свой набор) — к какому проверяемому срезу продукта относится кандидат:
срез отвечает на вопрос «что после этого куска можно запустить», а не «какой слой тронули».

1. Для каждого кандидата проверь SIZE_BUDGET (completeness-policy).
2. При OVER — разрежь (поверхность → агрегат → LIBRARY), обнови строки, назначь `SPLIT_GROUP`.
3. Итог C1: **0 × OVER** в колонке budget. Иначе не переходи к C2.

### B. Именование и зависимости

- Соседние номера + общий `SPLIT_GROUP`; `a`/`b` — только явная пара эпика.
- `ЗАВИСИТ ОТ` согласован с `dependency-graph.md`.
- PRE-CHECK следующего D ссылается на PRODUCES предыдущего осколка.

## Связность

1. `ЗАВИСИТ ОТ: Dxx…` согласовано с графом  
2. CONSUMES — существующие пути + якоря  
3. PRE-CHECK: нет артефакта → STOP  
4. Не додумывать контракты — дописать specs, если дыра  
5. `size_ok: yes` в каждом выданном D  

## Создай

### 1. `OUTPUT/roadmaps/00_overview.md`

- roadmap = **весь P0 IN SCOPE** (не только «удобный кусок»);
- v2+ только backlog;
- статусы — в `progress.md`.

### 2. `OUTPUT/roadmaps/dependency-graph.md`

Включая рёбра SPLIT_GROUP.

### 3. `OUTPUT/roadmaps/progress.md`

Все D + `split_group` + строки blocked_adr (mobile и т.п.).

**Командный режим (правило действует с v1.21).** `progress.md` — производный файл: каждый агент
пишет свой фрагмент `OUTPUT/roadmaps/progress.d/<Dxx>.md` (шаблон `TEMPLATES/progress.d-fragment.md`,
в нём `updated_at`), а таблица собирается командой:

```bash
node witness-done/SEED/sp-tools/sp.mjs progress --merge    # собрать progress.md из фрагментов
node witness-done/SEED/sp-tools/sp.mjs progress --check    # сверить; exit 2 при расхождении или дубле
```

Строка `done` без фрагмента — расхождение. `progress.md` помечен `merge=union` в `.gitattributes`.

### 4. `OUTPUT/roadmaps/coverage-matrix.md` (**обязательно**)

По `TEMPLATES/coverage-matrix.md` + completeness-policy.  
Колонки `SPLIT_GROUP`, `size_ok`.  
Итог: **0 × `missing`** для P0 (допустимы только `blocked_adr` с перечнем будущих D).

### 5. `OUTPUT/roadmaps/d-cut-list.md` (**обязательно**, C1)

См. процедуру нарезки выше.

### 6. `OUTPUT/prompts/D01_*.md` … + packs (C2, батчи ≤5)

По шаблону с **SIZE_BUDGET**, **CONTEXT_PACK**, **HOW**, **INVARIANTS**, **ACCEPTANCE**, **FIT_CHECKS**, **VERIFICATION_TAX**.

Для каждого D создай парный pack `OUTPUT/context/packs/Pxx.md` (+ `Pxx.validation.json` с `ok: true` после must_hit gate).  
FIT_CHECKS заполняй из CONSUMES якорей, PRIMARY LIBRARY, `07_conflicts`, `ЗАВИСИТ ОТ` — eco_invariants только из platform include + nfr среза.  
`app_contracts` у L2/L3: конкретные `METHOD /path` (≥1), не словесные ярлыки.

**C2 quality gates (fail → переписать D до STOP batch):**

| Gate | Правило |
|------|---------|
| HOW | Нумерованные шаги: actor, reason/event, wire, источник правды |
| INVARIANTS | 5–12 буллетов |
| SIZE_BUDGET | `size_ok: yes`, `produces_count ≤6`, surfaces ≤2, `delivery_slice` заполнен |
| ACCEPTANCE | L1 ≥3 / L2–L3 ≥6 ID `Axx.k` Given\|When\|Then; happy+негатив; у каждой фразы — тест, объявляющий её (`@acceptance Axx.k`) |
| Связь фраз и тестов | `sp-verify --gate acceptance` → 0: у каждой фразы есть объявленный тест, план `test-plan-Dxx.md` не расходится с исходниками |
| Decision lock | Нет «позже / если есть / на усмотрение» без схемы |
| Cross-D | CONSUMES ключи upstream → snapshot test в PRODUCES tests |
| GATE | L3 payments/quotas/ledger → human confirm |

**Формальная проверка пачки (обязательна после каждого batch):**

```bash
node SEED/sp-tools/sp-verify.mjs --gate d-prompt-quality --batch N
```

Гейт проверяет HOW, INVARIANTS (5–12), ACCEPTANCE (`Axx.k`, порог по уровню, префикс = D),
SIZE_BUDGET (`size_ok: yes`, `produces_count ≤6`, surfaces ≤2), PRODUCES (≤6 не-тестовых файлов),
CONTEXT_PACK (`pack_path` существует, `validation_ok: yes`), отсутствие плейсхолдеров.
`tax_pass: false` → batch **не закрыт**, D переписываются и пачка проверяется снова.

Для каждого UI-D при design present:

```text
CONSUMES: OUTPUT/docs/design-notes.md
ОГРАНИЧЕНИЯ: не подменять токены дизайна
```

В ЦЕЛЬ/ОГРАНИЧЕНИЯХ — конкретные правила домена (статусы, ошибки), не отсылки «см. ТЗ целиком»; ≤12 буллетов.

Обязательный блок в ОГРАНИЧЕНИЯХ:

```text
- Типизация: catalogs/typing-and-tests.md (JS → только TS strict; any запрещён)
- Автотесты: на весь новый/изменённый runtime-код в этом D; без тестов → не done
- Комментарии: catalogs/code-comments.md — подробные (модули, публичные API, ветки); язык русский
- VerificationTax: catalogs/verification-tax.md — done только после sp-verify pre_ci + acceptance_ids
- L2+: после pre_ci — `sp review Dxx --verdict supports --reviewer <кто>`, иначе акт не принят
- L3: `runtime_trace_required: yes` → внешний `evidence/Dxx.trace.json` (TEMPLATES/runtime-trace.md)
- Contours: catalogs/contour-smoke.md — wave smoke после split_group
- Context: читать только CONTEXT_PACK (catalogs/context-rag.md)
```

В PRODUCES — явные пути тестов с привязкой к `Axx.*` (`**/*.test.ts`, `*_test.go`, …) или пометка N/A если только docs/config.  
Считай `produces_count` **без** тестовых путей.

Level tax: L0 docs-only; L1 обычный runtime; L2 API/UI; L3 security/payments/quotas/ledger (+ human GATE).

В overview / d-cut-list помечай `split_group` как wave-marker (для contour smoke после пачки).

### 7. `OUTPUT/tests/test-plan-Dxx.md` + `INDEX.md` (C3)

Acceptance §12 ↔ кейсы. Таблица машинно-читаемая (`TEMPLATES/test-plan.md`):
`| A01.3 | фраза | tests/x.test.ts | covered |` — путь к тесту из `PRODUCES`, статус
`covered`/`ops`/`blocked`. Гейт `sp-verify --gate acceptance` сверяет план с исходниками:
план не может называть тест, который фразу не объявляет, и не может пропустить фразу
(DEC-027). Строки «напишем тесты позже» — провал, а не отсрочка.

### 8. `OUTPUT/roadmaps/improvement-backlog.md` (C3)

## Самопроверка перед STOP

- [ ] `d-cut-list.md` есть, budget все OK
- [ ] coverage-matrix заполнена, P0 без `missing`
- [ ] каждый gap-модуль имеет D
- [ ] нет D с PRODUCES «и всё остальное»
- [ ] у каждого D: блок SIZE_BUDGET, `size_ok: yes`, produces_count ≤ 6 (без тестов), `delivery_slice` заполнен
- [ ] нет D с >2 surfaces (кроме явно разрешённого thin-slice db+api)
- [ ] у каждого runtime D: CONTEXT_PACK + FIT_CHECKS + VERIFICATION_TAX
- [ ] у каждого runtime D (не L0): HOW + INVARIANTS + ACCEPTANCE с Axx ID
- [ ] каждая фраза ACCEPTANCE объявлена тестом; `--gate acceptance` даёт `tax_pass: true`
- [ ] L2/L3: app_contracts содержит ≥1 `METHOD /path`
- [ ] L3 money/quota: GATE human; api+ui не слеплены без thin-slice обоснования
- [ ] нет decision-lock нарушений («зафиксировать позже» и т.п.)
- [ ] у каждого pack: validation ok / must_hit
- [ ] cicd docs в CONSUMES у platform/hardening D
- [ ] OVER_BUDGET счётчик = 0
- [ ] wave-markers (`split_group`) согласованы с contour-smoke

## MANIFEST

Список D, test-plans, `coverage_matrix: done`, `d_cut_list: done`, path progress, `c_subwave`, OVER_BUDGET=0.

## STOP

```text
ROADMAP_PROMPTS: OK | C1_DONE | C2_BATCH_N
D-prompts: N | test-plans: N
coverage: P0 missing=0
SIZE_BUDGET over: 0
Следующий: C2 batch N+1 | C3 | PIPELINE/10_assembly.md
```
