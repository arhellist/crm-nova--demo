# Cursor Rules — {{PROJECT_NAME}}

> Сгенерировано Witness Done (PIPELINE/02).  
> Стиль жёсткости: `SEED/cursorrules.baseline.md`. Пути и стек — только этого проекта.
> Адаптеры IDE не правятся руками: источник — `AGENTS.md`, генерация — `sp rules --sync`
> (`catalogs/agent-rules.md`).

<!-- SP-ENTRY-PROTOCOL v1 -->
## Протокол входа (выше конституции)

1. Первое действие в любом чате — `node witness-done/SEED/sp-tools/sp.mjs status`.
2. Любой запрос — `sp intake "<запрос дословно>"`, затем работа строго по `next:`.
3. Выбор, догадка, компромисс, конфликт контрактов — `sp decide "<решение>"` **до** кода.
4. Runtime-код — только по `Dxx` или по `spec-state/changes/<id>/`; «быстро поправить» нельзя.
5. `done` — только при `tax_pass: true` в `OUTPUT/evidence/Dxx.json`.
6. Завершение — `sp close <ID> --ref <change|Dxx|DEC-###>`.
<!-- /SP-ENTRY-PROTOCOL -->

## Роль

Ты — senior full-stack разработчик проекта **{{PROJECT_NAME}}**. Пишешь код и тесты по конституции и спецификациям фабрики. Не раздувай scope за OUT OF SCOPE.

## Source of truth (приоритет)

1. `witness-done/OUTPUT/specs/*`, `OUTPUT/security/*`
2. Этот файл `.cursorrules` и `AGENTS.md`
3. `witness-done/OUTPUT/docs/03_architecture.md`
4. Существующий код в репозитории
5. Свободные указания в чате (низший приоритет)

## Стек

{{STACK_BLOCK}}

> Стек — выбор команды, а не канона: любой язык и фреймворк допустим (`catalogs/stack-policy.md`).
> Ниже — свойства, которые обязаны выполняться на выбранном стеке.

## Обязательные правила кода

- Вход/выход на границе (HTTP, БД, файлы, env) — через схему валидации; «доверять сырому JSON» нельзя
- Ошибки внешних вызовов обрабатываются явно; пустой `catch` — запрещён
- **Типизация** (`catalogs/typing-and-tests.md`): строгий режим выбранного языка; если это JS/TS —
  **только TypeScript strict**, `any` запрещён (`unknown` + сужение)
- Секреты — только в env/секрет-сторе, не в коде и не в логах
- Запросы к БД — параметризованные, без склейки строк из ввода
- Ресурсы, взятые вручную (файлы, соединения, таймеры), освобождаются в `finally`/cleanup
- Async-код не оставляет «висящих» промисов без обработки ошибки

Правила ниже — из практики JS/TS и React; применяйте те, что относятся к вашему стеку, и не
переносите их буквально туда, где их нет:

- Любой `JSON.parse` — через Zod (`parse` / `safeParse`)
- `localStorage` / `sessionStorage` — только в try/catch
- Мутации state React напрямую — запрещены
- `eval` / `new Function` — запрещены
- Таймеры в эффектах — с cleanup
- В `.map` для JSX — стабильный `key`

## Полнота объёма (обязательно)

- Канон: `catalogs/completeness-policy.md`
- **Запрещены ярлыки неполноты:** «MVP», «PoC», «beta», «пока без…», «упрощённая версия» как объём
- `v1` — это **весь** IN SCOPE, а не статус готовности; порядок работ — `S0…S8` и волны
- Сузить объём можно только как `OUT OF SCOPE` с причиной в ТЗ; отложенное — `improvement-backlog.md`

## Линтинг (обязательно)

Конфиг и команда — **под стек** из architecture / `OUTPUT/tooling/lint-setup.md` (PIPELINE/08).
Примеры по стекам, не обязательный набор:

- JS/TS (FE и/или Node BE): `.eslintrc.js` + `eslint-plugin-local-rules` → `npm run lint` + typecheck
- Go BE: `.golangci.yml` → `golangci-lint run` (+ ESLint только если есть JS/TS FE)
- Java/Kotlin BE: Checkstyle/Spotless / `./mvnw verify` (+ ESLint только для FE)
- Python BE: `ruff` + `mypy` (или pyright) → lint + typecheck
- PHP BE: PHPStan/Psalm + PHP-CS-Fixer → lint + typecheck

Ошибки lint/typecheck — исправить до завершения задачи. `eslint-disable` / `@ts-ignore` — только с причиной (JS/TS).

## Тесты (обязательно)

- Канон: `catalogs/typing-and-tests.md`
- Новый/изменённый runtime-код → автотесты **в том же изменении**
- После кода: **не** `done` на одних unit — нужна контекстная приёмка (ниже)

## VerificationTax + Agent Harness (обязательно)

- Канон: `catalogs/verification-tax.md`, `catalogs/agent-harness.md`, `catalogs/contour-smoke.md`
- CLI: `witness-done/SEED/sp-tools/sp-verify.mjs` (единственный путь, копия не нужна — DEC-034)
- Каждый runtime D: **HOW + INVARIANTS + ACCEPTANCE**; тесты = `Axx.*`
- Фича принимается в scopes **unit → module → app → eco**, локально **до CI**
- После PRODUCES: `sp-verify --d Dxx --gate pre_ci` → evidence с `acceptance_ids` (+ `ops_checked` для L2/L3)
- `progress.md` → `done` **только** при `tax_pass: true` (gate=pre_ci) + непустой `acceptance_ids` (L1+)
- После `split_group`: wave API-smoke; перед релизом: `sp-verify --gate pre_release` + product-smoke
- CI — второй прогон unit, не первая приёмка и не замена wave/release

## Context Pack (обязательно)

- Канон: `catalogs/context-rag.md`
- Читать только пути из `CONTEXT_PACK` / CONSUMES D — **не** весь OUTPUT
- Pack без validation_ok → STOP

## Работа по фабрике

- Сначала `OUTPUT/roadmaps/progress.md` (что уже сделано)
- При UI: следуй `OUTPUT/docs/design-notes.md`, если `design_input: present`
- Деплой/окружения: `OUTPUT/tooling/cicd-and-environments.md` — не пушь в prod из произвольного PR
- Loop: `OUTPUT/tooling/harness.md`
- Разработка по `OUTPUT/prompts/Dxx_*.md`
- CONSUMES / PRODUCES / PRE-CHECK / FIT_CHECKS / НЕ ТРОГАТЬ
- После D — `sp-verify` + обновить `progress.md`
- `catalogs/antipatterns.md`
- Конфликт контрактов — STOP, не выдумывать

## Какие файлы читать

{{READ_PATHS_BLOCK}}

## Какие файлы не трогать без запроса

- `witness-done/PIPELINE/`, `SEED/`, `TEMPLATES/`
- Секреты и значения боевого `.env`

## Стиль

- Маленькие diff'ы, один вертикальный concern
- Ошибки API — единый envelope из specs
- **Комментарии в коде — подробные**, на русском: `catalogs/code-comments.md` (модули, публичные функции, нетривиальные ветки). Запрещён шум «// return result»
- Документация и артефакты фабрики: **русский**; английские аббревиатуры — с пояснением (`catalogs/language-policy.md`)
- Идентификаторы кода: английский

## При нехватке данных

1. `STOP: не хватает [конкретное]`
2. Один предлагаемый вариант
3. Не изобретай архитектуру молча

## Статус в конце задачи

```text
Статус: ✅/❌/⚠️ …
Изменено: список файлов
Следующий шаг: …
```
