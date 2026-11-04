# === DEV PROMPT: [Dxx_name] ===

РОЛЬ: [platform | DBA | backend | frontend | qa | security]

GATE: [none | human confirm before coding]

> L3 money / quotas / ledger / payments → **обязательно** `human confirm before coding` (см. `catalogs/verification-tax.md`).

ЗАВИСИТ ОТ: [D01, D02, …] — сначала выполни их

## SIZE_BUDGET

> Канон: `catalogs/completeness-policy.md`. Если любой лимит нарушен — **не кодировать**: вернуть фабрику к сплиту.

| Поле | Значение |
|------|----------|
| surfaces | [db \| api \| ui \| worker \| tooling] (≤2) |
| produces_count | N (код/конфиг/миграции ≤6; тесты отдельно) |
| entity | один агрегат / «—» для platform |
| delivery_slice | S1 \| … (к какому срезу относится) |
| split_group | id группы или `none` |
| split_from | Dxx предыдущего осколка или `none` |
| size_ok | yes \| no |

## ЦЕЛЬ

Одна фраза: какой вертикальный результат (без «и» между независимыми deliverable).

## CONSUMES

- path/to/artifact — что именно (якорь / операции / секция), не «весь файл»
- …

## CONTEXT_PACK

> Канон: `catalogs/context-rag.md`. Тела specs не копировать — только pack.

| Поле | Значение |
|------|----------|
| pack_id | Pxx |
| pack_path | `OUTPUT/context/packs/Pxx.md` |
| retrieve_query | one-liner \| none |
| max_chunks | ≤12 |
| validation_ok | yes (обязательно до кода) |

## HOW (алгоритм)

> Канон v1.10. **What+How**: пошагово, не «сделай X». L0/docs-only: одна строка `N/A — <причина>`.

1. … — кто **actor**, какой **ledger reason** / событие (если есть), какая **транзакция**/хук.
2. … — порядок wire (подключить X в Y до/после миграции).
3. … — источник правды для чисел/флагов (какой файл/ключ; без «на усмотрение»).
4. …

## INVARIANTS

> 5–12 буллетов. Нарушение = баг. Не дублировать весь ТЗ.

1. …
2. …
3. …
4. …
5. …

## ACCEPTANCE

> Тесты **обязаны** покрыть эти сценарии (не «функция вызвалась»). ID: `A{{NN}}.k`.  
> L2/L3: **6–12** кейсов (happy + insufficient/authz + idempotent + негатив). L1: ≥3. L0: `N/A — <причина>`.
>
> **Связь проверяется машинно (v1.27).** Тест объявляет фразу `@acceptance A{{NN}}.k` в блоке
> или ID в имени теста, содержит утверждение, не пропущен и лежит в файле из PRODUCES.
> Иначе `pre_ci` падает. Фраза проверяется внешним контуром — перечисли её ID в
> `acceptance_ops` (FIT_CHECKS); освобождение попадёт в акт. Гейт `acceptance` дополнительно
> требует согласия `tests/test-plan-Dxx.md` с тестами.

| ID | Given | When | Then |
|----|-------|------|------|
| Axx.1 | … | … | … |
| Axx.2 | … | … | … |
| Axx.3 | … | … | … |

В evidence `fit.acceptance_ids` + `fit.ops_checked` перечислить все `Axx.*` и затронутые `METHOD /path`.
Пример объявления в тесте:

```ts
it('A01.2 — seq не переиспользуется после рестарта', () => {
  // @acceptance A01.2
  expect(nextSeqAfterRestart()).toBeGreaterThan(lastSeqBeforeCrash);
});
```

## FIT_CHECKS

> Канон: `catalogs/verification-tax.md`. Контекстная приёмка module/app/eco **до CI**.

| Поле | Значение |
|------|----------|
| module | LIBRARY id \| gap id \| none |
| conflicts_ref | `OUTPUT/docs/07_conflicts.md#…` \| none |
| conflicts_applied | список id конфликтов \| none |
| app_contracts | конкретные `METHOD /path` и/или entity ids (у L2/L3 ≥1 `METHOD /path`; пустой список запрещён) |
| runtime_trace_required | yes \| no — для `L3`: обязателен `OUTPUT/evidence/Dxx.trace.json` |
| invariants_skip | причина, по которой глобальные `INV-###` к заданию не применяются (иначе поле пустое) |
| depends_done | Dxx, … (должны быть `done` в progress) |
| eco_invariants | logging \| rate-limit \| no-secrets \| design-tokens \| … |
| acceptance_ops | `Axx.k`, … — фразы, которые проверяет внешний контур (иначе поле пустое; освобождение видно в акте) |
| pre_ci | required |
| pre_release | required \| skip |

## VERIFICATION_TAX

| Поле | Значение |
|------|----------|
| level | L0 \| L1 \| L2 \| L3 |
| verify_cmd | `sp-verify --d Dxx --gate pre_ci` (команды — `OUTPUT/tooling/verify-commands.md`) |
| evidence | `OUTPUT/evidence/Dxx.json` |
| done_forbidden_unless | `tax_pass=true` и `gate=pre_ci`, `fit.acceptance_ids` покрывает все `Axx.*` из ACCEPTANCE, `fit.acceptance_binding.ok=true` |
| review | для `L2+`: обязателен `sp review Dxx --verdict supports` от `reviewer` ≠ автор |

## PRODUCES

Код / конфиг / миграции (≤6 путей в SIZE_BUDGET):

- path/to/file — создать/изменить
- …
- `src/events/**` — glob разрешён, если задание меняет весь модуль; всё вне списка даёт `proof_debt`

`PRODUCES` — обещание, а не пожелание: `pre_ci` сверяет его с фактическим diff (`--base`,
по умолчанию merge-base с `origin/main`, иначе `HEAD`) в **обе** стороны. Тронутый файл вне списка
= `proof_debt` = `tax_pass: false`. Заявленный, но не тронутый файл виден в `plan.missing` и не валит акт.

Тесты (обязательны при runtime; **не** входят в лимит 6; кейсы = ID из ACCEPTANCE):

- path/to/test — Axx.1–Axx.N
- …

## НЕ ТРОГАТЬ

- …

## PRE-CHECK (выполнить до начала кода)

Для каждого пункта CONSUMES:

- [ ] Файл/артефакт существует — если нет → **STOP**: «Сначала выполни [Dxx] / почини consistency report»
- [ ] Контракт не помечен BLOCKER в `OUTPUT/docs/10_consistency_report.md`
- [ ] Нужные зависимости в `package.json` (если указаны ниже) — иначе добавь и `npm install` до кода
- [ ] `size_ok: yes` в SIZE_BUDGET — иначе STOP и сплит
- [ ] CONTEXT_PACK существует и `validation_ok` / `Pxx.validation.json` ok
- [ ] `depends_done` из FIT_CHECKS все `done` в progress
- [ ] `conflicts_ref: none` или `conflicts_applied` заполнен из `07_conflicts.md`
- [ ] HOW / INVARIANTS / ACCEPTANCE заполнены (или явный N/A для L0)
- [ ] Decision lock: нет «зафиксировать позже» / «если API есть» / «на усмотрение» без выбранной схемы в HOW

Если PRE-CHECK провален — не пиши код и не «додумывай» контракты.

## ОГРАНИЧЕНИЯ

- Стек и библиотеки:
- Запреты из AGENTS.md / antipatterns / **`catalogs/typing-and-tests.md`** / **`catalogs/code-comments.md`**:
  - типизация (JS → только TS strict; без `any`);
  - автотесты на новый/изменённый runtime-код в этом же изменении = сценарии ACCEPTANCE;
  - **подробные комментарии** (русский) на модули, публичные API, нетривиальные ветки;
- NFR для этого шага:
- CONFLICTS из `OUTPUT/docs/07_conflicts.md` и отличия из `07_module_plan.md` (если модуль затронут):
- Дизайн (`design-notes.md`), если UI и design present:
- Доменные правила **только для этого PRODUCES** (≤ **12** буллетов; не копировать ТЗ/openapi целиком):
  - …

## ТРЕБУЕМЫЙ ФОРМАТ ВЫВОДА

- Рабочий код/конфиг в PRODUCES
- Без псевдокода
- Автотесты в PRODUCES с ID `Axx.*` (или N/A с причиной)
- Краткий summary изменений в чате (список файлов)
- Обновить статус в тест-плане `OUTPUT/tests/`, если кейсы затронуты
- Обновить `OUTPUT/roadmaps/progress.md` (статус + доказательства)
- Если UI и есть design-notes — сверить токены/компоненты

## ЧЕКЛИСТ ПОСЛЕ ГЕНЕРАЦИИ

- [ ] Контракты CONSUMES соблюдены
- [ ] CONTEXT_PACK `validation_ok` и пути из pack прочитаны (не весь OUTPUT)
- [ ] HOW выполнен по шагам; INVARIANTS не нарушены
- [ ] Все `Axx.*` зелёные (тесты = сценарии, не smoke «вызвали функцию»)
- [ ] FIT_CHECKS: module / app / eco (не только unit); `app_contracts` с конкретными ops
- [ ] `proof_debt` пуст: тронуты только файлы из `PRODUCES` (служебные каталоги не считаются)
- [ ] Для `L3` при `runtime_trace_required: yes` — `OUTPUT/evidence/Dxx.trace.json` с существующими `ref`
- [ ] Глобальные `INV-###`, применимые к модулю и уровню, перечислены в `## INVARIANTS` по ID
- [ ] Ошибки и null/edge cases
- [ ] AuthZ / владение ресурсом (если API)
- [ ] Нет пунктов из antipatterns
- [ ] Типы/валидация на границах; **нет plain JS / any**
- [ ] **Подробные комментарии** по `catalogs/code-comments.md` (модули / публичные символы / сложные ветки)
- [ ] Автотесты написаны и зелёные
- [ ] `sp-verify --d Dxx --gate pre_ci` → `tax_pass: true` (evidence: `acceptance_ids` + `ops_checked`)
- [ ] `progress.md` → `done` **только** с evidence_ref и непустым `acceptance_ids` (L1+)
- [ ] UI: design-notes соблюдён (если present)
- [ ] Не вышел за PRODUCES и SIZE_BUDGET
- [ ] L3 money/quota: GATE human / spot-check выполнен (или скриптовый API-smoke затронутых ops)

## STOP

Остановись после PRODUCES + **pre_ci verify**. Не начинай следующий D-промпт.  
Обнови `OUTPUT/roadmaps/progress.md` перед финальным ответом.  
Канон loop: `catalogs/agent-harness.md`. Contours: `catalogs/contour-smoke.md`.

### Нельзя упростить / отложить (негатив)

- Не выкидывать кейсы ACCEPTANCE «чтобы быстрее зелёный CI».
- Не оставлять схему/флаг/колонку «на усмотрение» — решение в HOW/INVARIANTS или `blocked_adr`.
- Не ставить `done` без `fit.acceptance_ids` из промпта.
- Не подменять contour/wave smoke полным e2e на каждый D и наоборот — не подменять pre_ci «потом на staging».

# === КОНЕЦ ===
