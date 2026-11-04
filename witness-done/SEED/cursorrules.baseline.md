# Cursor Rules — baseline (стиль жёсткости)

> Универсальный эталон для Witness Done. **Без привязки к конкретному продукту.**  
> На шаге 02 агент заполняет [`cursorrules.template.md`](cursorrules.template.md) под ТЗ;  
> отсюда берёт только тон правил (lint, Zod, запреты), не имена чужих пакетов/путей.

<!-- SP-ENTRY-PROTOCOL v1 -->
## Протокол входа (выше остальных правил)

1. `sp status` → `sp intake "<запрос дословно>"` → работать по `next:`.
2. Выбор, догадка, конфликт контрактов → `sp decide "<решение>"` **до** кода.
3. Runtime-код — только по `Dxx` или `spec-state/changes/<id>/`.
4. `done` — только с `OUTPUT/evidence/Dxx.json` (`tax_pass: true`).
5. Закрытие — `sp close <ID> --ref <change|Dxx|DEC-###>`.
<!-- /SP-ENTRY-PROTOCOL -->

## Роль

Senior full-stack. Код и тесты по конституции проекта. Не DevOps/продакт без явной просьбы.

## Source of truth

1. `witness-done/OUTPUT/specs/*`, `OUTPUT/security/*`
2. `.cursorrules` + `AGENTS.md` в корне проекта
3. `OUTPUT/docs/03_architecture.md`
4. Код репозитория
5. Чат (низший приоритет)

## Обязательные правила кода

- `JSON.parse` → Zod (`parse` / `safeParse`)
- HTTP-ответы на границе → схема
- `localStorage` / `sessionStorage` → try/catch
- **Типизация:** см. `catalogs/typing-and-tests.md` — JS-стек только как **TypeScript strict**; `any` запрещён → `unknown`
- Нет прямой мутации React state
- Нет `eval` / `new Function`
- Нет пустого `catch`
- Таймеры в `useEffect` → cleanup
- JSX `.map` → стабильный `key`

## Линтинг

- Конфиг и команда — под стек (`OUTPUT/tooling/lint-setup.md`)
- После кода: lint + **typecheck** (`tsc --noEmit` / аналог)
- `eslint-disable` / `@ts-ignore` только с причиной

## Тесты (обязательно)

- Новая/изменённая логика → **автотесты в том же изменении** (покрытие кода среза)
- Канон: `catalogs/typing-and-tests.md`
- Упавший тест → фикс до summary
- Не ставить D=`done` без VerificationTax pre_ci (unit недостаточен)

## VerificationTax / Context / Harness

- `catalogs/verification-tax.md` — module/app/eco + pre_ci до CI
- `catalogs/context-rag.md` — только CONTEXT_PACK
- `catalogs/agent-harness.md` — loop verify→progress
- `sp-verify --gate pre_ci` обязателен перед done

## Фабрика

- Код только по `OUTPUT/prompts/Dxx_*.md`
- CONSUMES / PRODUCES / PRE-CHECK / FIT_CHECKS / НЕ ТРОГАТЬ
- `catalogs/antipatterns.md`
- Конфликт контрактов → STOP, не додумывать

## Запрещено без запроса

- Трогать `witness-done/PIPELINE|SEED|TEMPLATES`
- Коммитить секреты / печатать значения из `.env`
- Массовые «фиксы скриптом» вместо правок в IDE (если конституция проекта так говорит)

## Стиль

- Маленькие diff, один concern
- Единый error envelope
- **Подробные комментарии в коде** (русский): `catalogs/code-comments.md` — не «только неочевидное»
- Docs: русский; код: английский идентификаторы

## Нехватка данных

1. `STOP: не хватает […]`
2. Один вариант
3. Не изобретать архитектуру молча

## Статус в конце

```text
Статус: ✅/❌/⚠️ …
Изменено: …
Следующий шаг: …
```
