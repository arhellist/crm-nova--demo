# ORCHESTRATOR — полный прогон Witness Done

> **Единственная точка входа** для запуска Witness Done.  
> Режимы работы: `MODE: greenfield | brownfield`.  
> Внутренние шаги — файлы `PIPELINE/00`…`10` + `10b` (greenfield) и `PIPELINE/R00`…`R05` (brownfield).  
> Каталог эволюции спецификаций — `spec-state/`.

## Режимы работы (MODE)

Определяется в `OUTPUT/MANIFEST.md` перед стартом прогона:

- **`greenfield`**: Проектирование новой системы с нуля по ТЗ (`INPUT/TECH_SPEC.md`). Выполняются шаги `00_bootstrap`…`10_assembly` + `10b_self_audit`. На финише шага 10b (только при `SELF_AUDIT: PASS`) автоматически запускается шаг `R01_baseline_specs`, формирующий структуру `spec-state/baseline/` и переводящий проект в режим brownfield для дальнейшей эволюции.
- **`brownfield`**: Работа с существующей кодовой базой и живым репозиторием спецификаций `spec-state/`:
  - **Фаза инициализации**: `R00_reverse_engineer` (извлечение фактов из существующего кода as-is без домыслов) → `R01_baseline_specs` (первичная фиксация требований MUST/SHALL со сценариями GIVEN/WHEN/THEN в `spec-state/baseline/`).
  - **Фаза изменений (Change-цикл)**: `R02_propose_change` → `R03_apply_change` → `R04_verify_change` → `R05_archive_change`.

## Роль

Оркестратор Witness Done (версия из `@witness-done/VERSION`).  
Выполняй шаги по порядку выбранного режима. Код продукта в фазе оркестрации не писать.

## Вход

- `@witness-done/INPUT/TECH_SPEC.md`
- `@witness-done/VERSION`
- `@witness-done/README.md`
- `@witness-done/PROFILES.md`
- `@witness-done/catalogs/stack-policy.md`
- `@witness-done/catalogs/language-policy.md`
- `@witness-done/catalogs/completeness-policy.md`
- `@witness-done/catalogs/cicd-environments.md`
- `@witness-done/catalogs/design-input.md`
- `@witness-done/catalogs/business-goals.md`
- `@witness-done/catalogs/intake-and-decisions.md`
- `@witness-done/catalogs/agent-rules.md`
- `@witness-done/catalogs/verification-tax.md`
- `@witness-done/catalogs/contour-smoke.md`
- `@witness-done/catalogs/agent-harness.md`
- `@witness-done/catalogs/context-rag.md`
- `@witness-done/catalogs/code-comments.md`
- `@witness-done/OUTPUT/MANIFEST.md`
- Опционально: `@witness-done/INPUT/DESIGN.html`, `INPUT/design/*.html`
- При resume: `@witness-done/INPUT/ANSWERS.md`

## Режим волн (обязательно для надёжности контекста)

### 1. Greenfield волны (00–10)

Не пытайся «проглотить» 00–10 молча одним комком без checkpoint. Работай **волнами**:

| Волна | Шаги | Checkpoint в MANIFEST |
|-------|------|------------------------|
| **A** | 00 → 01 → 02 → 03 → 04 | `wave: A` `wave_status: done\|needs_human` |
| **B** | 05 → 06 → 07 → 08 | `wave: B` … |
| **C** | 09 (подволны C1→C2→C3) → 10 → 10b (C4) | `wave: C` … `c_subwave: C4` |

### 2. Brownfield волны (R00–R05)

| Фаза | Шаги | Назначение |
|------|------|------------|
| **BF_Init** | R00 → R01 | Реверс-инжиниринг существующего кода и первичная фиксация baseline specs в `spec-state/` |
| **BF_Change** | R02 → R03 → R04 → R05 | Итерационный цикл изменений: proposal/delta → apply → verify (`sp-verify --gate change`) → archive |

### Подволны волны C (SIZE_BUDGET / контекст)

Шаг 09 режет толстые задачи и сам не должен раздувать ответ. Внутри C:

| Подволна | Содержание | Resume |
|----------|------------|--------|
| **C1** | roadmap overview, dependency-graph, progress, coverage-matrix, **d-cut-list**, context index (без полных тел D) | `продолжай C2 batch 1` |
| **C2** | тела D + context packs батчами ≤5; после пачки — `sp-verify --gate d-prompt-quality --batch N` | `продолжай C2 batch N` |
| **C3** | test-plans + improvement-backlog; после пачки — `sp-verify --gate acceptance` (связь «фраза ↔ тест» и plan) | `продолжай волну C` |
| **C4** | шаг **10** (сборка) → шаг **10b** (self-audit: d-prompt-quality по пачкам ≤5, acceptance, self-audit, product-smoke) | `продолжай C4` / `шаг 10b` |

В MANIFEST: `c_subwave`, при C2 — `c2_batch`, при C4 — `10b_self_audit`.

После каждой волны (и после C1 / каждого C2-batch при риске контекста):

1. Обнови MANIFEST (`last_completed_step`, `wave`, `c_subwave`).
2. Выведи блок статуса волны (ниже).
3. Если контекст чата ещё позволяет и нет `NEEDS_HUMAN` — **сразу продолжай** следующую волну/подволну в той же сессии.
4. Если ответ раздут / риск потерять качество — заверши и попроси resume-фразу из таблицы.

Resume: прочитай MANIFEST → начни с первого `pending` после `last_completed_step` / нужного `c_subwave`.

## Правила

1. Каждый шаг — **полностью** по файлу `PIPELINE/NN_*.md`, не сокращай.
2. После шага — обновить MANIFEST + статус-блок.
3. `NEEDS_HUMAN` / критичный `BLOCKED` → STOP, жди ANSWERS / подтверждение.
4. ANSWERS готовы → доработай 01 при необходимости → продолжай с места остановки.
5. 3 попытки без ответа → defaults, `defaults_applied: true`.
6. Шапка крупных docs: `> Сгенерировано Witness Done v{VERSION}`.
7. Порядок фиксирован: **07 LIBRARY до 09 D-prompts** (не переставлять).
8. **Язык:** весь OUTPUT и корневые AGENTS/`.cursorrules` — **русский** по `catalogs/language-policy.md`.
9. **Полнота:** D-цепочка покрывает весь IN SCOPE (`completeness-policy` + `coverage-matrix.md` на шаге 09); IN SCOPE трассируется к **бизнес-целям/KPI**.
10. **SIZE_BUDGET:** толстые D запрещены; сплит обязателен (`completeness-policy`); шаг 10 аудитит.
11. **CI/CD:** шаг 08 документирует окружения и порядок деплоя (`cicd-environments`).
12. **Дизайн:** опциональный HTML в INPUT → `design-notes.md`; UI-D обязаны следовать.
13. **Типы и тесты:** `catalogs/typing-and-tests.md` — JS → TS strict; автотесты с каждым runtime D.
14. **VerificationTax:** контекстная приёмка module/app/eco + acceptance_ids; `done` только после `sp-verify --gate pre_ci` (`catalogs/verification-tax.md`).
14a. **Review (v1.18):** для `L2/L3` `pre_ci` не пропускает акт без `OUTPUT/evidence/Dxx.review.json` (`sp review Dxx --verdict supports`, `reviewer ≠ producer`); правка кода, включая файлы под glob в `PRODUCES`, обесценивает review.
14b. **Plan-to-Proof (v1.20):** `PRODUCES` сверяется с diff в обе стороны; тронутый файл вне списка — `proof_debt` и провал. Для `L3` с `runtime_trace_required: yes` нужен внешний `evidence/Dxx.trace.json` (`TEMPLATES/runtime-trace.md`).
14c. **Командный прогресс (v1.21):** строки `progress.md` собираются из `progress.d/<Dxx>.md` (`sp progress --merge`), сверяются `sp progress --check`; подтверждение `L3`-изменения — `spec-state/changes/<id>/approval.json`.
15. **Context RAG:** D с CONTEXT_PACK; не читать весь OUTPUT (`catalogs/context-rag.md`).
16. **Agent Harness:** loop pack→HOW/Axx→code→verify→progress (`catalogs/agent-harness.md`).
17. **Contour smoke:** после split_group — wave API-smoke; перед релизом — product-smoke (`catalogs/contour-smoke.md`).
18. **Комментарии в коде:** подробные, на русском (`catalogs/code-comments.md`).
19. **D self-check (v1.10):** HOW + INVARIANTS + ACCEPTANCE в каждом runtime D; decision lock против «на усмотрение».
20. **Бизнес-цели (v1.11):** сначала цель/KPI/GTM (`catalogs/business-goals.md`); SEO и маркетинг — следствие, не старт ТЗ.
21. **Self-audit (10b):** перед переходом в Brownfield — `sp-verify --gate d-prompt-quality` (пачки ≤5), `--gate acceptance` (связь «фраза ↔ тест» и test-plan), `--gate self-audit`, `--gate product-smoke`, `OUTPUT/docs/exit-criteria.md`; `SELF_AUDIT: PASS` обязателен для `R01`. Провал → исправления → повторный 10b.
22. **Профиль и паспорт (v1.12):** на шаге 00 фиксируется `MODE`, профиль (`PROFILES.md`) и отклонения от него; MANIFEST содержит статусы шагов 00–10b **и** R00–R05. Resume — только из MANIFEST.
23. **NFR проверяем (v1.12):** у каждого NFR есть число, способ проверки и владелец (`PIPELINE/06`, `docs/nfr.md`); иначе пункт не становится задачей.
24. **Единый вход (v1.14):** любой запрос начинается с `sp status` → `sp intake` → маршрут `next:`; resume — только через `sp next`. Выбор, догадка и конфликт контрактов фиксируются `sp decide` **до** кода; журнал — `journal/decisions/` (`catalogs/intake-and-decisions.md`). Правила агента живут только в корне проекта: `AGENTS.md` — источник, адаптеры IDE — генерация `sp rules --sync` (`catalogs/agent-rules.md`). Перед сдачей — `sp doctor --strict`.

## Шаги Greenfield (00–10)

| # | Файл | Выход |
|---|------|--------|
| 00 | `PIPELINE/00_bootstrap.md` | MANIFEST, каталоги, **корневой `AGENTS.md` + адаптеры IDE**, `decisions.md`, pre-commit |
| 01 | `PIPELINE/01_analyze_spec.md` | analysis, questions, **черновые срезы** |
| 02 | `PIPELINE/02_constitution.md` | полная конституция в корневом `AGENTS.md` + `sp rules --sync`, `definition-of-done.md` |
| 03 | `PIPELINE/03_architecture.md` | architecture, ADR |
| 04 | `PIPELINE/04_data_and_api.md` | data-model, OpenAPI |
| 05 | `PIPELINE/05_security.md` | security/* |
| 06 | `PIPELINE/06_nfr_scalability.md` | nfr |
| 07 | `PIPELINE/07_component_library.md` | `07_module_plan.md` + conflicts (**не** OUTPUT/library) |
| 08 | `PIPELINE/08_tooling_lint_cicd.md` | lint + **CI/CD/окружения** |
| 09 | `PIPELINE/09_roadmap_and_dev_prompts.md` | D-cut list + D-prompts (SIZE_BUDGET) + coverage-matrix + tests |
| 10 | `PIPELINE/10_assembly.md` | START_HERE, consistency, **feedback.md**, **exit-criteria.md** |
| 10b | `PIPELINE/10b_self_audit.md` | `10b_self_audit.md` + `.machine.json`, вердикт `SELF_AUDIT` → переход в `R01_baseline_specs` |

## Шаги Brownfield (R00–R05)

| # | Файл | Выход / Назначение |
|---|------|--------------------|
| R00 | `PIPELINE/R00_reverse_engineer.md` | Анализ кода as-is, `03_architecture`, `data-model`, `openapi-outline`, `domain-rules`, `07_module_plan`, `coverage-matrix` (`needs_human`) |
| R01 | `PIPELINE/R01_baseline_specs.md` | Фиксация требований MUST/SHALL и GIVEN/WHEN/THEN в `spec-state/baseline/<domain>/spec.md`, `spec-state/config.yaml` |
| R02 | `PIPELINE/R02_propose_change.md` | Формирование `spec-state/changes/<id>/` (`proposal.md`, delta `specs/`, `design.md`, `tasks.md`) |
| R03 | `PIPELINE/R03_apply_change.md` | Реализация задач из `tasks.md`, код и тесты строго по дизайну и дельте |
| R04 | `PIPELINE/R04_verify_change.md` | Верификация `sp-verify --change <id> --gate change`, 100% `tasks.md`, `tax_pass: true`, `OUTPUT/evidence/CHANGE-<id>.json` |
| R05 | `PIPELINE/R05_archive_change.md` | Слияние дельты (ADDED, MODIFIED, REMOVED) в baseline, перенос в `spec-state/archive/`, переиндексация `sp-retrieve` |

## Статус после шага

```text
[ШАГ NN] DONE | NEEDS_HUMAN | BLOCKED
Артефакты: …
Следующий: NN+1 | STOP
```

## Статус после волны / подволны C

```text
[ВОЛНА X] DONE | NEEDS_HUMAN
last_completed_step: NN
c_subwave: C1|C2|C3 (если C)
Продолжаю волну Y | Жду: «продолжай волну Y» | «продолжай C2 batch N»
```

## Финал

```text
ФАБРИКА ЗАВЕРШЕНА
Версия: …
PROJECT_ROOT: …
Читай: OUTPUT/docs/feedback.md → OUTPUT/docs/START_HERE.md
Дальше: по feedback закрыть вопросы (если есть) → lint → OUTPUT/prompts/D01_*.md
```
