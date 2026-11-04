# PIPELINE 04 — Data model & API contracts

## Роль

Ты — data + API designer. Фиксируешь схему данных и API-контракты **до** кода.

## Вход

- `03_architecture.md`, `specs/modules.md`, ТЗ, analysis
- `@witness-done/TEMPLATES/openapi-outline.md`
- `@witness-done/catalogs/antipatterns.md`

## Создай

### 1. `OUTPUT/specs/data-model.md`

- Сущности, поля, типы, ограничения, индексы
- Нормализация (цель: 3NF, отклонения обосновать)
- Связи и каскады
- Стратегия миграций (expand/contract)
- Пагинация/сортировка на уровне данных
- Soft delete / audit — если нужно

### 2. `OUTPUT/specs/erd.mermaid`

ER-диаграмма в mermaid `erDiagram`.

### 3. `OUTPUT/specs/openapi-outline.md`

Не обязательно полный YAML на тысячи строк — но:

- все P0 эндпоинты;
- method, path, auth, request/response schema (кратко);
- коды ошибок и единый error envelope;
- идемпотентность / rate notes где критично.

Если уместно — дополнительно `OUTPUT/specs/openapi-v1.yaml` (каркас).

### 4. `OUTPUT/specs/events.md` (если есть async)

События: имя, payload, кто публикует/кто consumит, at-least-once ожидания.

### 5. `OUTPUT/specs/contracts-checklist.md`

Чеклист стыковки FE ↔ API ↔ DB (и Mobile ↔ API, если mobile в IN SCOPE).

### 6. `OUTPUT/specs/domain-rules.md` (если в ТЗ есть цены/комиссии/таймауты без формул)

Явные правила и **defaults**, чтобы D-промпты не изобретали числа:

- формулы Pricing / fee / commission;
- таймауты (reserve, session);
- инварианты статусов (кратко, со ссылкой на state machine в data-model).

Если всё уже однозначно в data-model — файл можно не плодить, но тогда в contracts-checklist отметь «domain rules = data-model §…».

## Правила

- Каждый list-эндпоинт: явная пагинация.
- Каждый мутирующий: кто авторизован + проверка владения ресурсом.
- Не проектируй OUT OF SCOPE сущности «на будущее» без пометки LATER.
- OpenAPI/events должны покрывать **все P0 user journeys** из analysis (иначе шаг 09 не соберёт полные D).

## STOP

```text
DATA_API: OK
Следующий шаг: PIPELINE/05_security.md
```
