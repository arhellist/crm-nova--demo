# PIPELINE 10 — Assembly, QA of docs, Start pack

## Роль

Staff engineer на приёмке. Код продукта не писать. Вердикт READY / READY_WITH_DEFAULTS / BLOCKED.

## Вход

- Весь `OUTPUT/**`
- `@witness-done/TEMPLATES/start-here.md`
- `@witness-done/VERSION`
- catalogs: language, stack, completeness, cicd-environments, design-input, **business-goals**, **typing-and-tests**, **verification-tax**, **contour-smoke**, **agent-harness**, **context-rag**, **code-comments**
- `OUTPUT/docs/07_module_plan.md`, `07_conflicts.md`
- `OUTPUT/roadmaps/coverage-matrix.md`
- `OUTPUT/docs/nfr.md` (число + способ проверки у каждого NFR)
- `OUTPUT/docs/exit-criteria.md` (если создан на шаге 09/10; иначе создаётся здесь)
- `OUTPUT/tooling/cicd-and-environments.md`
- `OUTPUT/tooling/harness.md`, `verify-commands.md` (если есть — иначе MAJOR)
- `OUTPUT/docs/runbooks/product-smoke.md`, `scripts/smoke/wave-*.sh` (если нет — MAJOR)

## Сделай

### 1. `OUTPUT/docs/10_consistency_report.md`

Аудит: data-model ↔ openapi ↔ modules ↔ security ↔ D-prompts ↔ `07_module_plan` ↔ `07_conflicts` ↔ **`coverage-matrix`** ↔ cicd docs ↔ design.

Также проверить **язык** (`catalogs/language-policy.md`): целые разделы на английском → MAJOR; аббревиатуры без пояснения → MINOR. По возможности исправить (`auto_fixed`).

Проверить, что **нет** каталога `OUTPUT/library/` (запрещён). Если есть — MAJOR: удалить и перенести суть в `07_module_plan.md`.

**Полнота (completeness-policy):**

| Check | Severity если fail |
|-------|-------------------|
| Нет `coverage-matrix.md` | BLOCKER |
| В `01_analysis.md` нет секции бизнес-целей / KPI или цели не трассируются на IN SCOPE | MAJOR |
| SEO/маркетинг в IN SCOPE без связи с GTM/KPI из analysis | MAJOR |
| P0 IN SCOPE со статусом `missing` | BLOCKER |
| P0 `partial` без плана дописи | MAJOR |
| Mobile/SEO/… в IN SCOPE без D и без `blocked_adr`+будущих D | BLOCKER |
| Нет `cicd-and-environments.md` или пустой TODO | BLOCKER |
| `design_input: present`, но нет `design-notes.md` | MAJOR |
| UI-D без CONSUMES design-notes при present | MAJOR |
| Нет ссылки на typing-and-tests в AGENTS/`.cursorrules` | MAJOR |
| D с runtime без тестов в PRODUCES / шаблоне чеклиста | MAJOR |
| CI без typecheck/test strategy | MAJOR |
| Нет `d-cut-list.md` | MAJOR |
| NFR без числа или без способа проверки (`docs/nfr.md`) | MAJOR |
| D без блока `## SIZE_BUDGET` | MAJOR |
| D: PRODUCES code/config/миграции **> 6** (тесты не считаются) | MAJOR |
| D: > **2** surfaces без явного thin-slice (`db`+`api` ≤6) | MAJOR |
| D: `size_ok: no` или OVER_BUDGET в d-cut-list | MAJOR |
| D: >12 буллетов доменных правил «простынёй» / копипаст целого ТЗ в ОГРАНИЧЕНИЯХ | MAJOR |
| Runtime D без `## CONTEXT_PACK` / `## FIT_CHECKS` / `## VERIFICATION_TAX` | MAJOR |
| Runtime D (не L0) без `## HOW` / `## INVARIANTS` / `## ACCEPTANCE` | MAJOR |
| L1 ACCEPTANCE < 3 кейсов / L2–L3 < 6 кейсов `Axx.k` | MAJOR |
| L2/L3 `app_contracts` без `METHOD /path` | MAJOR |
| L3 payments/quotas/ledger с `GATE: none` | MAJOR |
| Decision lock: «зафиксировать позже» / «если API есть» / «на усмотрение» без схемы | MAJOR |
| `api`+`ui` в одном D без thin-slice обоснования в SIZE_BUDGET | MAJOR |
| Нет product-smoke runbook / wave smoke script (шаг 08) | MAJOR |
| Pack без validation ok или must_hit miss | MAJOR |
| AGENTS/`.cursorrules` без VerificationTax / harness / context-pack | MAJOR |
| AGENTS/`.cursorrules` без политики подробных комментариев (`code-comments`) | MAJOR |
| Нет `OUTPUT/tooling/harness.md` или `verify-commands.md` | MAJOR |

Обязательная таблица проблем:

| # | Проблема | Severity | Где (файлы) | Причина | Фикс (конкретный) | Приоритет |
|---|----------|----------|-------------|---------|-------------------|-----------|
| 1 | … | BLOCKER/MAJOR/MINOR | path vs path | … | что именно изменить в каком файле | 1 |

Секции:

- **Рекомендации по фиксам (порядок)** — сначала все BLOCKER
- **Откат / что править** — для каждого BLOCKER: «править A, не B» с обоснованием (источник правды: обычно data-model > openapi для полей БД; openapi > FE types для контракта API)
- **Если фиксы не внесены** — D-промпты PRE-CHECK не пройдут / разработка не стартует для затронутых срезов

Если можешь безопасно поправить артефакты сам (очевидная опечатка типов) — поправь и отметь `auto_fixed`. Иначе оставь человеку явный фикс.

### 2. `OUTPUT/docs/START_HERE.md`

По шаблону `TEMPLATES/start-here.md`:

- **первым** пункт: читай `OUTPUT/roadmaps/progress.md` (+ `coverage-matrix.md` при сомнениях);
- команды lint/install **под фактический стек**;
- ссылка на `OUTPUT/tooling/cicd-and-environments.md` (порядок деплоя);
- если design present — ссылка на `design-notes.md`;
- порядок D, карта папок OUTPUT.

### 3. `OUTPUT/docs/10_improvements.md`

Продукт / архитектура / фабрика / LIBRARY — Impact × Low effort.

### 4. Корневые артефакты (по стеку из architecture)

- [ ] `.cursorrules`
- [ ] `AGENTS.md`
- [ ] Линтер **по языкам v1** (см. шаг 08):  
      JS/TS → `.eslintrc.js` + `eslint-plugin-local-rules`;  
      Go → `.golangci.yml`;  
      Java → checkstyle/spotless в build;  
      **не** требовать ESLint, если в стеке нет JS/TS
- [ ] Есть `OUTPUT/roadmaps/progress.md` и **`coverage-matrix.md`** (P0 missing=0 или только blocked_adr)
- [ ] Есть `OUTPUT/tooling/cicd-and-environments.md`
- [ ] `design_input` согласован с наличием/отсутствием `design-notes.md`
- [ ] AGENTS/`.cursorrules` содержат типизацию + обязательные автотесты (`typing-and-tests`)
- [ ] AGENTS/`.cursorrules` содержат VerificationTax + CONTEXT_PACK + harness loop
- [ ] AGENTS/`.cursorrules` содержат политику подробных комментариев (`code-comments`)
- [ ] Tooling: typecheck + test runner + **verify-commands** + **harness** задокументированы
- [ ] Есть `OUTPUT/docs/runbooks/product-smoke.md` и `scripts/smoke/wave-*.sh`
- [ ] Runtime D: HOW + INVARIANTS + ACCEPTANCE; L2/L3 app_contracts с METHOD /path
- [ ] Есть `OUTPUT/docs/feedback.md`
- [ ] Каталоги `OUTPUT/context/`, `OUTPUT/evidence/` существуют (evidence файлы появятся при разработке)

### 5. Проверка окружения

- [ ] `PROJECT_ROOT/package.json` — есть / нет (warning, ссылка на tooling fragment)
- [ ] `PROJECT_ROOT/node_modules` — есть / нет → человек: `npm install`
- [ ] `PROJECT_ROOT/.env` в git? — **warning**, не коммитить секреты
- [ ] CONFLICTS без открытых blocker (иначе не выше BLOCKED)
- [ ] coverage-matrix: нет P0 `missing`
- [ ] d-cut-list + SIZE_BUDGET: нет OVER_BUDGET / `size_ok=no`
- [ ] `01_analysis.md`: секция бизнес-целей/KPI; IN SCOPE трассируется к KPI
- [ ] SEO/маркетинг в scope только с GTM/KPI (иначе OUT)
- [ ] `docs/nfr.md`: у каждого NFR есть число, способ проверки и владелец

### 6. `OUTPUT/docs/10_handoff_checklist.md`

Включая: ANSWERS/defaults, consistency BLOCKER закрыты или приняты, CI skeleton, lint, typing/tests.

### 7. `OUTPUT/docs/feedback.md` (**обязательно**)

По шаблону `@witness-done/TEMPLATES/feedback.md`. Это **обратная связь человеку** после полного прогона:

- готов ли проект к разработке (можно ли стартовать D01);
- исчерпывающий ли комплект промпт-документации (analysis → specs → D → tests → tooling → coverage);
- хватает ли понимания «что и как писать», или есть **конкретные вопросы** на уточнение;
- рекомендуемые следующие шаги.

Правила честности:

- Не писать «всё идеально», если есть `partial` / `blocked_adr` / `READY_WITH_DEFAULTS` с существенными defaults.
- Вопросы — только actionable (с указанием файла/D, которого касается).
- Вердикт согласовать с MANIFEST / consistency (не противоречить BLOCKER).

Упомяни `feedback.md` в `START_HERE.md` (блок «после фабрики / перед D01»).

### 8. MANIFEST финал + run log

Версия из `VERSION`, вердикт, путь к `OUTPUT/docs/feedback.md`, список BLOCKER, ссылка на
`OUTPUT/docs/exit-criteria.md`.

### 9. `OUTPUT/docs/exit-criteria.md` (E1…E90)

По шаблону `@witness-done/TEMPLATES/exit-criteria.md`: каждый критерий — наблюдаемое поведение, у каждого
есть способ проверки и доказательство. Отсутствие файла — **BLOCKER** для перехода в Brownfield.
Финальная проверка полноты из шага 10 обязана подтвердить, что покрытие без пропусков, у каждого
задания есть материалы и план проверок, а у каждого среза — способ проверки.

### 10. Автоматический переход: 10b → Brownfield

При успешном вердикте (`READY` или `READY_WITH_DEFAULTS`):

1. Запусти шаг `PIPELINE/10b_self_audit.md` (волна **C4**): `sp-verify --gate d-prompt-quality`
   по пачкам, `--gate self-audit`, `--gate product-smoke`.
2. Только при `SELF_AUDIT: PASS` инициируй `PIPELINE/R01_baseline_specs.md`.
   При `FAIL` — исправления и повторный 10b; переход запрещён.
3. Сформируй `spec-state/config.yaml` и `spec-state/baseline/<domain>/spec.md` из артефактов `OUTPUT/`
   с обязательными формулировками MUST/SHALL и сценариями GIVEN/WHEN/THEN (не меньше двух: happy path
   + negative/boundary).
4. Переведи проект в состояние живого каталога спецификаций: последующие доработки и расширения
   функционала выполняются через change-пайплайн Brownfield (`R02_propose_change` → `R03` → `R04` → `R05`).

## Вердикт

```text
ASSEMBLY: READY | READY_WITH_DEFAULTS | BLOCKED
ROOT_CURSORRULES/AGENTS/LINT: yes|no
CONFLICTS blockers: N
Consistency BLOCKERs: N
coverage P0 missing: N
SIZE_BUDGET over: N
CICD documented: yes|no
design_input: present|none
feedback.md: yes
feedback.md: yes
exit-criteria.md: yes
Env warnings: …
Дальше: 10b self-audit → START_HERE → npm install && npm run lint → D01
```

## STOP

Шаг 10 завершён, но Greenfield-прогон **ещё не финиширован**: следующий шаг — `PIPELINE/10b_self_audit.md`.
Проект переводится в Brownfield-состояние (`spec-state/`) только после `SELF_AUDIT: PASS`.
