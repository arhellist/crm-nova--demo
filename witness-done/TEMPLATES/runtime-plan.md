# Runtime plan — как поднимать и как верифицировать

> Путь: `OUTPUT/runtime/runtime-plan.json`
> Канон: `catalogs/runtime-plan.md`; связан с `catalogs/contour-smoke.md`, `catalogs/verification-tax.md`.
> Гейты: `sp-verify --gate runtime-plan` (статика), `sp-verify --gate runtime` (исполнение).
> Пример: `SEED/runtime/runtime-plan.example.json`.

## Зачем

Фабрика при прогоне **уже знает** стек, порты, миграции, seed и фразы приёмки: она сама их записала
в шагах 02–07. Значит она может **вывести** из своих входов исполняемый план подъёма и проверки —
и не имеет права оставить заглушку `{{...}}`. План пишется на шаге 08 из `architecture`, `04_data_and_api`,
`nfr`, `env-vars` и `01_contract.md`, а не выдумывается заново.

План — это не отчёт. Это **исполняемый контракт окружения**: ровно то, что гоняет `--gate runtime`.

## Схема

```json
{
  "version": 1,
  "stack": ["node", "typescript", "postgres"],
  "up": [
    { "id": "db", "cmd": "docker compose up -d db",
      "ready": { "type": "cmd", "cmd": "pg_isready -h localhost", "timeout_s": 60 } },
    { "id": "api", "cmd": "npm run dev:api &",
      "ready": { "type": "http", "url": "http://localhost:3000/health", "expect": 200, "timeout_s": 90 } }
  ],
  "seed": [{ "id": "test-user", "cmd": "npm run db:seed:test", "idempotent": true }],
  "down": [{ "cmd": "docker compose down -v" }],
  "verify": [
    { "acceptance": "A03.1", "cmd": "bash scripts/smoke/A03.1-publish-debit.sh", "expect_exit": 0,
      "artifacts": ["OUTPUT/evidence/trace/A03.1-charge.json"] },
    { "acceptance": "A07.1", "na": "UI проверяется в playwright-проекте", "reason": "фабрика не поднимает браузер" }
  ]
}
```

| Поле | Обязательно | Что значит |
|------|-------------|------------|
| `version` | да | `1` |
| `stack` | да | Из каких компонентов собирается окружение (из `architecture.md`) |
| `up[]` | да | ≥1 шаг подъёма. `ready` — когда шаг считать готовым: `http` (url + expect) или `cmd` (exit 0), с `timeout_s` |
| `seed[]` | нет | Подготовка данных. `idempotent: true` обязателен: повторный прогон не должен ломать состояние |
| `down[]` | да | Teardown. Выполняется **всегда**, даже при провале проверки |
| `verify[]` | да | По одной записи на фразу: `cmd` + `expect_exit` (+ `artifacts`) **или** `na` + `reason` |

`acceptance` — только `Axx.k` из `01_contract.md`. Метка, которой нет в контракте, — фантом и провал.

## Что делает `--gate runtime`

1. Статически проверяет план: нет заглушек (`{{`, `TODO`, `<...>`, `PRICING_PATH`), `down` непуст,
   `seed` идемпотентен, метки не фантомные, каждая **принятая** фраза либо проверяется, либо снята с причиной.
2. Поднимает `up[]` по порядку и ждёт `ready` (поллинг, не `sleep`).
3. Гоняет `seed[]`.
4. Гоняет `verify[]`, пишет логи команд в `OUTPUT/evidence/trace/`, сверяет `artifacts` по sha256.
5. Всегда снимает `down[]`.
6. Пишет `OUTPUT/evidence/RELEASE-runtime-verify.json`: что поднялось, что проверено, где логи, `tax_pass`.
7. Если внешнего `Dxx.trace.json` нет — **порождает** его из своего прогона с полями
   `commit`, `code_hash` и `produced_by`, чтобы `pre_ci` принял трейс без ручной подделки формы.

План неисполним статически → исполнение не начинается: неверная команда не должна трогать окружение.

## Пределы, которые нельзя закрыть планом

- `na` обязателен там, где проверка требует того, чего у фабрики нет: браузер, живой PSP, внешний OLAP.
  Снять проверку можно только с причиной — это видно в акте и в `pre_release`.
- Автотрейс (`produced_by`) доказывает, что прогон был **на этом коде**, но не отменяет вопроса
  «правильный ли оракул»: `verify[]` — это тесты проекта, а не истина о продукте.
- Долгий прогон: `--budget-min` ограничивает общий бюджет, тест за бюджетом не исполняется
  и попадает в `issues`.

## Когда план не нужен

Проект без runtime-кода (чистая библиотека, шаблоны): `runtime-plan.json` не создаётся, `pre_release`
не требует акт. Появление `PRODUCES` с кодом делает план обязательным на шаге 08.
