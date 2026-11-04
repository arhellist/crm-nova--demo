# 10_improvements — что улучшить (Impact × Low effort)

> Продукт / архитектура / фабрика / LIBRARY. Каждый пункт — с ожидаемым эффектом и стоимостью.
> Это не backlog продукта (`roadmaps/improvement-backlog.md`), а улучшения текущего комплекта.

## Продукт

| # | Улучшение | Impact | Effort | Где |
|---|-----------|--------|--------|-----|
| 1 | Добавить в карточку объекта счётчик просроченных задач (по `status_ages`) | medium | low | D06, отчёт `report_status_ages` |
| 2 | Показывать в «Моих задачах» дату последнего перехода прямо в строке | medium | low | D09, история D03 |
| 3 | Клавиатурные сокращения для перехода статуса (J/K + Enter) | low | medium | D08 |
| 4 | Улучшить пустое состояние отчётов: объяснить, что данных ещё нет | low | low | D12 |

## Архитектура

| # | Улучшение | Impact | Effort | Где |
|---|-----------|--------|--------|-----|
| 5 | Вынести snapshot-тест ключей `TaskRow` между D07 и D08 в общий fixture | high | low | тест-планы D07/D08 |
| 6 | Добавить таблицу `report_cache` вместо in-process кэша при втором инстансе API | medium | medium | D11, ADR-0003 |
| 7 | Явно зафиксировать версию образа `postgres:16.x` (не `latest`) | medium | low | D10 compose |
| 8 | Добавить проверку `wal_level=logical` в `check.mjs` как отдельный пункт | high | low | D10 |

## Фабрика (Witness Done)

| # | Улучшение | Impact | Effort | Где |
|---|-----------|--------|--------|-----|
| 9 | Автоматически связывать `Axx` из промптов с `01_contract.md` (сейчас контракта нет, phantom-check выключен) | high | medium | `SEED/sp-tools/runtime-plan.mjs` |
| 10 | Валидировать `Pxx.validation.json` при `sp doctor`, а не только при ручном `sp-retrieve` | medium | low | `SEED/sp-tools/sp.mjs` |
| 11 | Дать `sp-verify --gate d-prompt-quality --all` вместо трёх батчей вручную | medium | low | `sp-verify.mjs` |
| 12 | Проверять в `self-audit`, что у каждого D есть test-plan с полным набором фраз | high | low | `sp-verify.mjs` |
| 16 | Убрать `acceptance`/`product-smoke`/`runtime` из 10b: они требуют кода, которого на 10b нет | high | medium | `PIPELINE/10b_self_audit.md`, `ORCHESTRATOR.md` |
| 17 | Сделать selftest `validate.sh` герметичным: фикстур с реальным ТЗ + явный `--canon`, не использовать `OUTPUT/MANIFEST.md` как переключатель режима | high | medium | `SEED/sp-tools/selftest.sh`, `sp.mjs` |
| 18 | Исключить `witness-done/**` из проверки «файлы вне PRODUCES» — иначе strict красный на каждой установке и обновлении канона | high | low | `evidence-lib.mjs` |
| 19 | `sp next` должен учитывать статус шага и `10b_self_audit`, а не только `last_completed_step` | high | low | `sp.mjs` |

## LIBRARY

| # | Улучшение | Impact | Effort | Где |
|---|-----------|--------|--------|-----|
| 13 | `crud-table`: добавить готовый keyset-хелпер (сейчас адаптируется вручную в D05/D07) | high | medium | `LIBRARY/crud-table` |
| 14 | `auth-jwt`: зафиксировать вариант «роль из БД» как отдельный профиль, а не адаптацию | medium | low | `LIBRARY/auth-jwt` |
| 15 | `logging-pino`: добавить redact-список из проекта как дефолт | medium | low | `LIBRARY/logging-pino` |

## Порядок

1. Сначала 16, 17, 18, 12 — они снимают ложные зелёные и разблокируют 10b.
2. Затем 5, 8, 19 — дешёвые проверки и маршрутизация.
3. Затем 7, 10, 11 — гигиена окружения и гейтов.
4. 13–15 — после первого релиза, по фактическим трениям.
