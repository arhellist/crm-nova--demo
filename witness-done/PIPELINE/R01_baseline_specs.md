# PIPELINE R01 — Baseline Specs (Фиксация базовых спецификаций)

## Роль

Ты — ведущий системный архитектор и хранитель спецификаций Witness Done. Твоя задача: на основе собранных фактов (после шага `R00_reverse_engineer` для legacy-проекта или после шага `10_assembly` при переходе из Greenfield) сформировать каталог **`spec-state/`** и зафиксировать эталонный Baseline требований.

## Вход (обязательно изучи)

- Артефакты из `OUTPUT/`:
  - `OUTPUT/docs/03_architecture.md`
  - `OUTPUT/specs/data-model.md`
  - `OUTPUT/specs/openapi-outline.md`
  - `OUTPUT/specs/domain-rules.md`
  - `OUTPUT/docs/07_module_plan.md`
  - `OUTPUT/roadmaps/coverage-matrix.md`
- Шаблон конфигурации: `@witness-done/TEMPLATES/spec-state-config.yaml`

## Правила

1. **Однократная инициализация Baseline:** Базовые спецификации в `spec-state/baseline/<domain>/spec.md` фиксируются однократно как исходная точка правды («отправной снимок»). Все последующие изменения проекта разрешено вносить **только** через дельты изменений (`R02_propose_change` → `R03` → `R04` → `R05`).
2. **Формат требований MUST / SHALL:** Каждое требование формулируется с использованием ключевых слов `MUST` или `SHALL`.
3. **Обязательные BDD-сценарии:** Каждое требование обязано содержать **минимум два** формализованных сценария в синтаксисе `GIVEN` / `WHEN` / `THEN`:
   - `#### Scenario: happy path` — основной успешный сценарий;
   - `#### Scenario: negative / boundary` — отказ, нарушенное предусловие или граница.
   Требование только с happy path считается неполным: про отказ не подумали, и `sp-verify --gate change` его не примет.
4. **Историческая совместимость:** неочевидные, но действующие особенности фиксируются **явно** как контракт совместимости (например, особый идентификатор для конкретного клиента). Если их не записать, следующий исполнитель «починит» поведение и сломает историю.
5. **Структурирование по доменам:** Спецификации разносятся по изолированным бизнес- и системным доменам (`auth`, `core`, `billing` и т.д.).
6. **Язык:** Русский язык описания согласно `catalogs/language-policy.md`.

## Сделай

1. Создай каталог состояния спецификаций `PROJECT_ROOT/spec-state/`:
   - `spec-state/baseline/`
   - `spec-state/changes/`
   - `spec-state/archive/`
2. Создай манифест `spec-state/config.yaml` на основе `TEMPLATES/spec-state-config.yaml`:
   - Укажи актуальный список доменов (`domains`), выявленных при анализе;
   - Зафиксируй директории `baseline`, `changes`, `archive`.
3. Создай спецификации по доменам `spec-state/baseline/<domain>/spec.md`:
   - Заголовок `# Domain Spec: <Domain Name>`;
   - Описание назначения домена и его границ;
   - Секции требований в формате:
     ```markdown
     ### Requirement: <Название требования>
     Система MUST <описание поведения>.
     Компонент SHALL <дополнительное условие>.

     #### Scenario: happy path
     - GIVEN <контекст/состояние системы>
     - WHEN <вызов или триггер>
     - THEN <проверяемый результат>

     #### Scenario: negative / boundary
     - GIVEN <нарушенное предусловие или граница>
     - WHEN <операция вызывается>
     - THEN <система MUST отклонить действие без нарушения SoT / без утечки секретов>
     ```
4. Обнови `OUTPUT/MANIFEST.md`:
   - Отметь завершение инициализации `spec-state`: статус `R01` → `done`;
   - Зафиксируй перечень созданных доменных спецификаций.
5. Зафиксируй запись в `OUTPUT/docs/00_run_log.md`.
6. Выполни проверку базовой линии:
   - `node witness-done/SEED/sp-tools/sp-verify.mjs --gate baseline --root PROJECT_ROOT`
   - Статус `tax_pass: true` обязателен: у каждого требования `MUST`/`SHALL` и ≥2 сценария
     (`happy path` + `negative / boundary`). Провал → исправить `spec.md` и повторить.
7. Выполни индексацию спецификаций через инструмент retrieval:
   - `node witness-done/SEED/sp-tools/sp-retrieve.mjs --reindex` (если доступен).

## Формат ответа в чате

```text
BASELINE_SPECS: OK | BLOCKED
Домены: [список инициализированных доменов]
Спецификации baseline: [пути созданных spec.md]
Всего зафиксировано требований: [количество]
Статус проекта: Brownfield инициализирован. Переход к change-циклу (R02_propose_change).
```
