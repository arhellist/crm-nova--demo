# === DEV PROMPT: D06_objects_ui ===

РОЛЬ: frontend

GATE: none

ЗАВИСИТ ОТ: D04, D05

## SIZE_BUDGET

| Поле | Значение |
|------|----------|
| surfaces | ui |
| produces_count | 6 |
| entity | object |
| delivery_slice | S4 |
| split_group | objects |
| split_from | none |
| size_ok | yes |

## ЦЕЛЬ

Дать руководителю экран объектов: список с поиском, карточку с задачами, форму создания и правки,
подтверждение архивирования — на контракте D05 и без собственной проверки прав.

## CONSUMES

- `OUTPUT/docs/design-notes.md` — токены, компоненты таблицы/карточки/диалога, состояния
- `OUTPUT/prompts/D05_objects_contract.md` — `ObjectRow`, `ObjectInput`, коды ошибок, keyset-курсор
- `OUTPUT/specs/domain-rules.md` — правила объекта и архивирования
- `OUTPUT/specs/data-model.md` — §3.2 `objects`, поля карточки
- `OUTPUT/security/authn-authz.md` — SEC-05: управление только `manager`
- `OUTPUT/docs/nfr.md` — NFR1 (p95 ≤400 мс), NFR22 (до «Мои задачи» ≤30 с)

## CONTEXT_PACK

| Поле | Значение |
|------|----------|
| pack_id | P06 |
| pack_path | `OUTPUT/context/packs/P06.md` |
| retrieve_query | objects list card form archive dialog design tokens empty state |
| max_chunks | 8 |
| validation_ok | yes |

## HOW

1. `src/features/objects/objectKeys.ts` — ключи TanStack Query: `['objects', {cursor, q, includeArchived}]`,
   `['object', id]`, `['tasks', {objectId}]`; инвалидация после мутаций — точечная, не весь кэш.
2. `src/features/objects/useObjects.ts` — `useInfiniteQuery` поверх `listObjects`, `getNextPageParam`
   из `hasMore`/`nextCursor` D05; поиск по подстроке выполняется на клиенте только по загруженным
   страницам, серверный `q` не изобретать (модуль `search` не включён).
3. `src/features/objects/ObjectsPage.tsx` — таблица: название, адрес, число задач, дата; кнопка
   «Объект» у `manager`; пустое состояние «Объектов пока нет» с действием; скелетон при загрузке.
4. `src/features/objects/ObjectForm.tsx` — одна форма для создания и правки, поля из `ObjectInput`,
   ошибки полей из zod, кнопка блокируется на время мутации, при 42501 — «Недостаточно прав».
5. `src/features/objects/ObjectArchiveDialog.tsx` — подтверждение с названием объекта и текстом
   «Объект и его задачи останутся в истории»; после успеха диалог закрывается, список инвалидируется.
6. `src/features/objects/ObjectsPage.tsx` также маршрут `/objects/:id` → карточка: заголовок, адрес,
   бейдж «Архив», список задач объекта из D07 (до D07 — состояние «Задачи загружаются»).
   Кнопки управления рендерятся только при `role === 'manager'`, но права всё равно проверяет БД.

## INVARIANTS

1. Интерфейс не является проверкой прав: скрытие кнопки не заменяет RLS (INV-002).
2. Исполнитель не видит кнопок создания, правки и архивирования объектов.
3. Название и адрес валидируются до отправки; пустые значения не уходят на сервер.
4. Архивный объект помечен бейджем и не исчезает из списка при `includeArchived`.
5. Ошибка сервера показывается текстом без SQL и имён таблиц (INV-007).
6. Пагинация не подменяется `offset`; «Показать ещё» использует курсор из D05.
7. Удаление объекта в UI отсутствует: только архивирование.
8. Все действия доступны с клавиатуры, фокус в диалоге удерживается (NFR-10).
9. Раскладка проверена на 360/768/1440 без горизонтального скролла (NFR-08).

## ACCEPTANCE

| ID | Given | When | Then |
|----|-------|------|------|
| A06.1 | `manager`, 25 объектов | Открыть `/objects` | Видно 20 строк, «Показать ещё» добавляет остальные без дублей |
| A06.2 | `executor` | Открыть `/objects` | Нет кнопок создания/правки/архива, список содержит только доступные объекты |
| A06.3 | `manager` | Создать объект с пустым названием | Ошибка поля, запрос к серверу не отправлен |
| A06.4 | `manager` | Архивировать объект и подтвердить | Бейдж «Архив», запрос к RPC выполнен один раз |
| A06.5 | Архивный объект | Открыть карточку | Видны данные и задачи, кнопки правки скрыты для архивного |
| A06.6 | Пустой список объектов | Открыть `/objects` | Пустое состояние с текстом и действием, без пустой таблицы |

## FIT_CHECKS

| Поле | Значение |
|------|----------|
| module | crud-table |
| conflicts_ref | `OUTPUT/docs/07_conflicts.md#2-конфликты-с-архитектурными-решениями` |
| conflicts_applied | `crud-table` offset/COUNT |
| app_contracts | `GET /rest/v1/objects`, `POST /rest/v1/rpc/archive_object` |
| runtime_trace_required | no |
| invariants_skip | пусто |
| depends_done | D04, D05 |
| eco_invariants | design-tokens |
| acceptance_ops | A06.1, A06.2 |
| pre_ci | required |
| pre_release | required |

## VERIFICATION_TAX

| Поле | Значение |
|------|----------|
| level | L2 |
| verify_cmd | `sp-verify --d D06 --gate pre_ci` |
| evidence | `OUTPUT/evidence/D06.json` |
| done_forbidden_unless | `tax_pass=true`, A06.1–A06.6 покрыты тестами |
| review | `sp review D06 --verdict supports` от ревьюера ≠ автор |

## PRODUCES

- `src/features/objects/objectKeys.ts` — создать
- `src/features/objects/useObjects.ts` — создать
- `src/features/objects/ObjectsPage.tsx` — создать
- `src/features/objects/ObjectForm.tsx` — создать
- `src/features/objects/ObjectArchiveDialog.tsx` — создать
- `src/app/router.tsx` — изменить (маршруты объектов)

Тесты:

- `src/features/objects/ObjectsPage.test.tsx` — A06.1, A06.2, A06.6
- `src/features/objects/ObjectForm.test.tsx` — A06.3
- `src/features/objects/ObjectArchiveDialog.test.tsx` — A06.4, A06.5

## НЕ ТРОГАТЬ

- `src/features/objects/api.ts`, `schema.ts` — контракт D05.
- `src/features/tasks/**` — D07/D08.

## PRE-CHECK

- [ ] D05 `done`, `listObjects` и `archiveObject` экспортированы
- [ ] `P06.validation.json` → `ok: true`
- [ ] `size_ok: yes`
- [ ] `design-notes.md` содержит компоненты таблицы и диалога

## ОГРАНИЧЕНИЯ

- Стек: React 18, TanStack Query, React Router 6.
- Типизация: `catalogs/typing-and-tests.md`, без `any`.
- Автотесты: Testing Library + MSW, по кейсу на `A06.*`.
- Комментарии: `catalogs/code-comments.md`, на русском, у инвалидации кэша.
- VerificationTax: `done` после `pre_ci` и `acceptance_ids`.
- Context: только CONTEXT_PACK.
- Дизайн: `design-notes.md` — токены и компоненты, свои стили не вводить.
- NFR: NFR1 (p95 ≤400 мс), NFR22 (до полезного действия ≤30 с).
- Доменные правила (≤12): архивный объект читаем; удаление отсутствует; исполнитель видит объект
  только при наличии своей задачи; число задач в строке — из данных задачи, не «примерно».
- Запрет: проверять права на клиенте как единственный барьер; `select *`.

## ТРЕБУЕМЫЙ ФОРМАТ ВЫВОДА

- Компоненты в PRODUCES, рабочий код.
- Тесты `A06.*`.
- Список файлов и описание состояний экрана.
- Обновить test-plan и progress; после закрытия группы `objects` — wave smoke.

## ЧЕКЛИСТ ПОСЛЕ ГЕНЕРАЦИИ

- [ ] Список и карточка работают на данных D05
- [ ] Исполнитель не видит управляющих действий
- [ ] Ошибки показываются без деталей БД
- [ ] Клавиатура и адаптив проверены
- [ ] `proof_debt` пуст

## STOP

Остановиться после PRODUCES и `pre_ci`; D07 не начинать.
