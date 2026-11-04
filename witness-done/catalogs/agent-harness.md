# Agent Harness — операционная оболочка агента

> Канон Witness Done (правило действует с v1.10).  
> **Agent Harness** = программа вокруг LLM: loop, context, safety, verify.  
> Не путать с тестовыми файлами `*Harness*.ts(x)` (eslint override в SEED) и не с опечаткой «Harnest».

## Четыре роли

| Роль | В фабрике |
|------|-----------|
| **Loop** | Один D за сессию → PRE-CHECK → код + Axx-тесты → `sp-verify --gate pre_ci` → progress |
| **Context** | Только `CONTEXT_PACK` / CONSUMES; не читать весь OUTPUT |
| **Safety** | PRODUCES-only, SIZE_BUDGET, antipatterns, GATE на L3, decision lock |
| **Verify** | VerificationTax scopes + acceptance_ids + evidence; mistake → постоянное правило |

## Артефакты после прогона

| Файл | Кто пишет |
|------|-----------|
| `PROJECT_ROOT/.cursorrules` + `AGENTS.md` | шаг 02 |
| `OUTPUT/tooling/harness.md` | шаг 08 |
| `OUTPUT/tooling/verify-commands.md` | шаг 08 |
| CLI `sp-retrieve` / `sp-verify` | SEED → копируется на 08 |
| `docs/runbooks/product-smoke.md`, `scripts/smoke/wave-*.sh` | шаг 08 из SEED/smoke |

## Loop (обязательный порядок)

1. Прочитать `OUTPUT/roadmaps/progress.md`
2. Открыть следующий D + его `CONTEXT_PACK` (validated)
3. PRE-CHECK + FIT_CHECKS deps + HOW/INVARIANTS/ACCEPTANCE заполнены
4. Реализовать только PRODUCES (+ тесты **по каждому `Axx.*`**)
5. `sp-verify --d Dxx --gate pre_ci`
6. При pass: проверить evidence — `fit.acceptance_ids` непустой (L1+), `ops_checked` для L2/L3; затем `done` + `evidence_ref`
7. При fail: `needs_rework` — не `done`
8. STOP — не начинать следующий D
9. Если D закрыл `split_group` / wave — выполнить contour smoke (`catalogs/contour-smoke.md`)
10. L3 money/quota — GATE human spot-check или targeted API-smoke
11. Перед релизом: `sp-verify --gate pre_release` + полный product-smoke на staging

## Mistake → rule

Повторяющиеся ошибки агента кодифицировать:

1. eslint local-rule или пункт в AGENTS / antipatterns
2. Ужесточить FIT_CHECKS / verify-commands / ACCEPTANCE для модуля
3. Не чинить «напоминанием в чате» без записи в harness

## Resume-фразы

- `продолжай Dxx` — после STOP / needs_rework
- `sp-verify pre_ci Dxx` — перепрогон tax
- `sp-verify pre_release` — готовность к staging/prod
- `wave smoke <group>` — контур 2 после пачки

## Запреты

- Называть Agent Harness просто «Harness» в eslint-путях без уточнения (коллизия с test harness)
- Пропускать pre_ci «потому что CI потом поймает»
- Ставить `done` без `acceptance_ids` в evidence (L1+)
- Игнорировать HOW и писать «как проще»
