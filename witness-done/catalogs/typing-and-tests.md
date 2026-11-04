# Типизация и автотесты (обязательно)

> Канон Witness Done (правило действует с v1.10). Вшивается в constitution (шаг 02), D-промпты (09), tooling (08), assembly (10).

## 1. Типизация

### Правило

Прикладной код пишется так, чтобы типы проверялись автоматически настолько, насколько это даёт
выбранный язык. Канон не требует конкретного языка: требование — **строгий режим того, что выбрано**.

| Стек из ТЗ / architecture | Требование |
|---------------------------|------------|
| JavaScript (Node/FE) | **Только TypeScript** (`strict`). Plain `.js`/`.jsx` для app-кода **запрещены** (допустимы конфиги: `*.config.js`, скрипты tooling — по минимуму) |
| TypeScript уже выбран | `strict: true`; `any` запрещён → `unknown` + сужение; запрет `@ts-ignore` без причины |
| Go | Идиоматичные типы; не `interface{}` / `any` без нужды; ошибки явно |
| Java / Kotlin / C# | Типы в сигнатурах; generics где уместно; не сырой `Object` в домене |
| Python | Аннотации типов обязательны; `mypy`/`pyright` в CI в строгом режиме; `Any` — только с причиной |
| PHP | `declare(strict_types=1)`; PHPStan/Psalm на максимальном уровне; типизированные DTO |
| Ruby / иной динамический | Sorbet/RBS или typed-слой на границах + runtime-схемы |
| Иной язык с типами | Максимальный строгий режим компилятора/линтера |
| Язык без типизации вообще | Допустим как выбор команды, но **типы на границах обязательны**: runtime-схемы входа/выхода + документированные контракты. Прод без проверки границ — провал `eco` |

### Переменные и границы

- Локальные переменные, параметры, поля DTO — типизированы (вывод типов OK, если не «любой тип»).
- Границы API / JSON / env — **runtime-схемы** (Zod, pydantic, JSON Schema, аналоги) + типы из них.
- Публичные функции модулей — явные типы входа/выхода.

### Tooling (шаг 08)

- Typecheck выбранного стека в CI, без `continue-on-error` для app-пакетов после D01:
  `tsc --noEmit`, `go vet` + сборка, `mypy`, PHPStan, компилятор JVM/C#…
- Линтер под язык: `@typescript-eslint` + запрет `any` (error), `golangci-lint`, `ruff`, PHP-CS-Fixer…
- В `lint-setup.md` и `.cursorrules` — явная ссылка на эту политику.

## 2. Автотесты

### Правило

При реализации PRODUCES агент **в том же изменении** пишет автотесты, покрывающие новый/изменённый код. «Тесты потом» — антипаттерн.

### Тесты = ACCEPTANCE (v1.10, связь проверяется машинно с v1.27)

- Каждый кейс `Axx.k` из секции ACCEPTANCE D → исполняемый тест, который **объявляет** фразу:
  `// @acceptance A01.3` в тест-блоке или ID в имени теста (`it('A01.3 — событие записано первым')`).
  Это не комментарий «для человека», а вход гейта (`acceptance-bind.mjs`, DEC-027).
- Тест, объявивший фразу, обязан содержать утверждение (`expect`/`assert`/`should`/`t.Error`/…),
  не быть пропущенным (`skip`, `todo`, `@Disabled`, `#[ignore]`, `t.Skip`) и лежать в файле,
  заявленном в `PRODUCES` задания. Иначе `pre_ci` падает: «объявил A01.3, но утверждения нет»,
  «пропущен», «фраза A01.3 без теста».
- **Запрещён** единственный assert вида «функция вызвалась / не бросила» без проверки Given→Then.
- Happy + insufficient funds/authz + idempotent + негатив — по таблице ACCEPTANCE, не «один smoke».
- Тест, ссылающийся на `Axx.k`, которого нет в ACCEPTANCE, — провал: редакции фраз и тестов
  не расходятся молча.
- Фраза проверяется внешним контуром, а не кодом? Перечисли её ID в `FIT_CHECKS` →
  `acceptance_ops`: освобождение попадает в акт, а не остаётся устной договорённостью.
- **Предел:** гейт не читает смысл теста. `expect(true).toBe(true)` формально проходит — это
  видит ревьюер (`sp review`), а не парсер. Гейт доказывает наличие исполняемого утверждения,
  целостность ссылки и неизменность фразы после приёмки.

### Что покрывать

| Слой | Минимум |
|------|---------|
| Domain / services | unit: ветки, ошибки, инварианты статусов (= Axx) |
| API handlers | integration: authz, 4xx/2xx, идемпотентность где есть |
| Jobs / workers | unit или integration на happy + fail path |
| UI (критичные flows) | component или e2e smoke по test-plan D |
| Адаптеры портов | mock port + контрактные тесты |
| Cross-D keys/reasons | shared fixture / snapshot: D_n падает, если читает несуществующий ключ D_m |

### Cross-D contract tests

Если D_n CONSUMES ключи тарифов, ledger reasons, schema fields из D_m:

- в PRODUCES тестов — shared snapshot/fixture (например `tariffs.keys.test.ts`);
- в ACCEPTANCE — явный кейс «ключ/reason из upstream существует»;
- wire-хуки (подключить getX до packs) — шаг в HOW + A-кейс на наличие вызова.

### Definition of done для D

1. Код PRODUCES  
2. Тесты на этот код, объявляющие фразы (`@acceptance Axx.*` или ID в имени) — пути в PRODUCES
   (`tests/**`, `*.test.ts`, `*_test.go` …)  
3. Lint + typecheck OK  
4. Тесты зелёные локально / в CI script  
5. `sp-verify pre_ci` → evidence с `acceptance_ids` и `acceptance_binding.binding_hash`  
6. Кейсы в `OUTPUT/tests/test-plan-Dxx.md` отмечены, а `sp-verify --gate acceptance` подтверждает,
   что план и тесты говорят об одном и том же

Нельзя ставить `progress.md` → `done`, если тесты не добавлены (кроме чисто docs/config D без исполняемой логики — тогда явно «N/A: нет runtime-кода»).

### Tooling (шаг 08)

Зафиксировать раннер под стек:

- Node/TS: `vitest` или `jest` (+ скрипт `test` в package.json)  
- Go: `go test ./...`  
- Java/Kotlin: Surefire/Gradle test  
- Python: `pytest`  
- PHP: PHPUnit  
- Иной: штатный раннер языка; если его нет — добавить в `verify-commands.md` и обосновать в ADR

Все три команды (`lint`, `typecheck`, `test`) в `OUTPUT/tooling/verify-commands.md` должны
существовать в проекте: гейт исполнит их буквально и получит ложный провал на чужой команде.

CI: job `test` **обязателен** (не только `continue-on-error` после появления первого test-скрипта).

### Связь с test-plans фабрики

`OUTPUT/tests/test-plan-Dxx.md` — чеклист приёмки с машинно-читаемыми строками
(`| A01.3 | фраза | tests/x.test.ts | covered |`, шаблон — `TEMPLATES/test-plan.md`).  
Автотесты в репозитории — **исполняемое** покрытие. Оба нужны: план трассирует ТЗ, код-тесты ловят регрессии.  
Расхождение плана и тестов (`--gate acceptance`) — провал: план, называющий тест, который фразу
не объявляет, хуже отсутствия плана, потому что выглядит как доказательство.
Wave/product-smoke — контуры 2–3 (`catalogs/contour-smoke.md`), не замена Axx unit/integration.

## 3. Запреты (кратко)

- App-код на plain JavaScript «чтобы быстрее» (если стек JS/TS)
- `any` / отключение strict «на время»
- Прод-код без проверки типов там, где язык динамический
- PRODUCES без тестов при наличии логики
- `done` в progress при красных / отсутствующих тестах / пустых `acceptance_ids`
- Моки, которые делают тест бессмысленным (всегда green)
- Тест «мимо» ACCEPTANCE без обновления таблицы

## 4. Куда ссылаться

- `AGENTS.md` / `.cursorrules` (шаг 02)
- Каждый D: HOW / INVARIANTS / ACCEPTANCE + ОГРАНИЧЕНИЯ (`TEMPLATES/dev-prompt.md`)
- `catalogs/verification-tax.md`, `catalogs/contour-smoke.md`
- `catalogs/antipatterns.md`
- `catalogs/completeness-policy.md` (качество среза)
