# PIPELINE 10b — Self-audit (аудит собственного продукта)

> Волна **C4**. Выполняется **после** шага 10 и **до** перехода в Brownfield (`R01_baseline_specs`).
> Аудит идёт **по артефактам**, а не по «мнению модели»: каждое утверждение должно иметь файл-доказательство.

## Роль

Независимый аудитор фабрики. Код продукта не писать. Цель — доказать, что произведённый комплект
пригоден к исполнению, или вернуть его на исправления.

## Вход

- `OUTPUT/MANIFEST.md` (состояние после шага 10)
- `OUTPUT/roadmaps/coverage-matrix.md`, `OUTPUT/roadmaps/progress.md`, `OUTPUT/roadmaps/d-cut-list.md`
- `OUTPUT/docs/exit-criteria.md` (**E1…E90**, создаётся на шагах 10 / 10b)
- `OUTPUT/prompts/D*.md` (тела заданий)
- `OUTPUT/tests/*` (планы проверок)
- `OUTPUT/evidence/*.json` (акты, если разработка уже началась)
- `OUTPUT/docs/runbooks/product-smoke.md`, `scripts/smoke/*`
- `spec-state/baseline/` (для проверки будущей базовой линии)
- catalogs: `completeness-policy`, `verification-tax`, `contour-smoke`, `context-rag`, `agent-harness`

## Сделай

### 0. Автоматический прогон (обязательно)

```bash
# Качество тел заданий — пачками не больше 5 (канон C2)
node SEED/sp-tools/sp-verify.mjs --gate d-prompt-quality --batch 1
node SEED/sp-tools/sp-verify.mjs --gate d-prompt-quality --batch 2
# … до batches_total из вывода (или через --batch N по числу пачек)

# Критерии завершения + покрытие + акты
node SEED/sp-tools/sp-verify.mjs --gate self-audit

# Связь «фраза ACCEPTANCE ↔ тест»: объявления в тестах + text-plan + текст фраз
node SEED/sp-tools/sp-verify.mjs --gate acceptance

# Вход, правила IDE и трассируемость запрос → решение → изменение → акт
node SEED/sp-tools/sp.mjs doctor --strict
node SEED/sp-tools/sp.mjs rules --check

# Дымовой прогон контура (если скрипт и runbook есть)
node SEED/sp-tools/sp-verify.mjs --gate product-smoke
node SEED/sp-tools/sp-verify.mjs --gate runtime-plan   # план: статическая полнота
node SEED/sp-tools/sp-verify.mjs --gate runtime        # план: подъём + проверка + teardown
```

`d-prompt-quality` проверяет по каждому D: `HOW`, `INVARIANTS` (5–12), `ACCEPTANCE` (`Axx.k`,
L1 ≥3, L2/L3 6–12, префикс совпадает с D, у фразы есть текст Given/When/Then), `SIZE_BUDGET`
(`size_ok: yes`, `produces_count ≤6`, surfaces ≤2), `PRODUCES` (≤6 не-тестовых файлов),
`CONTEXT_PACK` (`pack_path` существует, `validation_ok: yes`), отсутствие незаполненных
плейсхолдеров. `acceptance` дополнительно сверяет тесты с фразами и с `tests/test-plan-Dxx.md`
(DEC-027).

### 1. Аудит по осям

| Проверка | Что смотрит | Если провал |
|---|---|---|
| **Доказательства** | по каждому заданию: гейт, налог, утверждения `Axx.*` | задание нельзя считать готовым |
| **Базовая линия** | `spec-state/baseline/` покрывает все домены из архитектуры | следующий этап начнётся с дыры |
| **Качество заданий** | HOW / INVARIANTS / ACCEPTANCE / SIZE_BUDGET (гейт выше) | задание непригодно к исполнению |
| **Планы проверок** | у каждого `Axx.*` есть тест, объявивший фразу (`@acceptance`/ID в имени), и строка в `tests/test-plan-Dxx.md` | приёмка — фикция: `--gate acceptance` |
| **Критерии завершения** | `E1…E90`: каждое условие проверяемо и имеет доказательство | продукт не соответствует ТЗ |
| **Риски** | у каждого риска есть владелец и статус | риск без владельца — это сюрприз |
| **Трассируемость** | `sp doctor --strict`: у каждой записи входа есть `next` и закрытие; у каждого change — поле `Intake`; `DEC-` существуют; правила IDE синхронны | работа шла мимо Witness Done: запрос и решение не восстановить |

### 2. `OUTPUT/docs/exit-criteria.md`

По шаблону `TEMPLATES/exit-criteria.md`. Требования:

- каждый критерий — **наблюдаемое поведение**, а не «сделано хорошо»;
- у каждого есть ID `E<n>`, способ проверки и **доказательство** (файл/команда/акт);
- пустая или `—` колонка доказательства = критерий не закрыт.

### 3. `OUTPUT/docs/10b_self_audit.md` + `10b_self_audit.machine.json`

Человекочитаемый отчёт + машинный результат для повторных прогонов. В отчёте:

- сводная таблица по осям: `pass | fail | n/a` + ссылка на доказательство;
- список провалов с конкретным фиксом и владельцем;
- вердикт: `SELF_AUDIT: PASS | FAIL`.

### 4. Ремедиация и повторный аудит

Если `sp-verify --gate self-audit` или `d-prompt-quality` вернул `tax_pass: false`:

1. Исправить артефакт **в источнике** (шаг 04/07/09), а не «замазать» в отчёте.
2. Повторно прогнать затронутый гейт.
3. Обновить `10b_self_audit.md` и `MANIFEST`.

Повторный аудит обязателен после каждой правки покрытия, промптов или критериев завершения.

### 5. MANIFEST + переход в Brownfield

- `wave: C`, `c_subwave: C4`, `last_completed_step: 10b`, `10b_self_audit: done`.
- Только при `SELF_AUDIT: PASS` запускать `PIPELINE/R01_baseline_specs.md`.
- При `FAIL` — `NEEDS_HUMAN` / `BLOCKED`, переход в Brownfield запрещён.

## Чек-лист

- [ ] `sp-verify --gate d-prompt-quality` по всем пачкам → `tax_pass: true`
- [ ] `sp-verify --gate self-audit` → `tax_pass: true`
- [ ] `sp-verify --gate product-smoke` → `tax_pass: true` (или явное `n/a`, если контура ещё нет)
- [ ] `sp-verify --gate runtime-plan` → `tax_pass: true`, если есть `OUTPUT/runtime/runtime-plan.json`
- [ ] `sp-verify --gate runtime` → `tax_pass: true`; акт `RELEASE-runtime-verify.json` в evidence
- [ ] в акте нет `uncovered`: каждая принятая фраза либо проверена, либо `na` с причиной
- [ ] у каждого `done` уровня `L2/L3` есть `OUTPUT/evidence/Dxx.review.json` с `verdict: supports` и `reviewer ≠ producer` (`sp review`)
- [ ] `sp progress --check` → exit 0 (строки `progress.md` совпадают с фрагментами `progress.d/`, дублей `D` нет)
- [ ] `sp-verify --verify-evidence` по всем актам `done` → exit 0 (печать сходится, `produces_digest` актуален)
- [ ] `sp doctor --strict` → exit 0 (вход, правила IDE, акты, единственность `ORCHESTRATOR.md`)
- [ ] `sp rules --check` → exit 0 (адаптеры IDE синхронны с `AGENTS.md`)
- [ ] каждая запись входа закрыта (`sp close`) или имеет актуальный `next`
- [ ] `OUTPUT/docs/exit-criteria.md` существует; у каждого `E<n>` есть доказательство
- [ ] coverage-matrix: 0 строк без D
- [ ] каждое `done` в progress.md имеет `OUTPUT/evidence/Dxx.json` с непустым `acceptance_ids`
- [ ] `sp-verify --gate acceptance` → `tax_pass: true` (каждая фраза объявлена тестом, план согласован)
- [ ] у каждого `Axx.*` есть план проверки и тест, который фразу объявляет
- [ ] у каждого риска есть владелец
- [ ] `10b_self_audit.md` + `10b_self_audit.machine.json` созданы
- [ ] MANIFEST обновлён (`10b_self_audit: done`)

## STOP

`SELF_AUDIT: PASS` → `PIPELINE/R01_baseline_specs.md`.  
`SELF_AUDIT: FAIL` → исправления → повторный 10b. Код продукта не писать.

```text
SELF_AUDIT: PASS | FAIL
DOCTOR: PASS | FAIL (strict)
RULES: PASS | FAIL
Следующий шаг: PIPELINE/R01_baseline_specs.md
```
