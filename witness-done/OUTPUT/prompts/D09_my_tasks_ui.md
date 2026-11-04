# === DEV PROMPT: D09_my_tasks_ui ===

РОЛЬ: frontend

GATE: none

ЗАВИСИТ ОТ: D07, D08

## SIZE_BUDGET

| Поле | Значение |
|------|----------|
| surfaces | ui |
| produces_count | 6 |
| entity | task |
| delivery_slice | S6 |
| split_group | tasks |
| split_from | none |
| size_ok | yes |

## ЦЕЛЬ

Дать исполнителю и менеджеру экран «Мои задачи»: сгруппированный список по статусам, счётчики,
фильтр и переход в один клик — первый результат, ради которого открывают систему.

## CONSUMES

- `OUTPUT/prompts/D07_tasks_contract.md` — `listMyTasks`, `changeTaskStatus`, фильтры и сортировка
- `OUTPUT/prompts/D08_tasks_ui.md` — `StatusPanel`, `HistoryList` (переиспользовать, не копировать)
- `OUTPUT/specs/domain-rules.md` — статусы и допустимые переходы исполнителя
- `OUTPUT/docs/design-notes.md` — токены статусов, компонент строки списка
- `OUTPUT/docs/nfr.md` — NFR22 (≤30 с до первого действия), NFR1 (список ≤400 мс)
- `OUTPUT/specs/data-model.md` — §7 пагинация и индекс `tasks(assignee_id, status)`

## CONTEXT_PACK

| Поле | Значение |
|------|----------|
| pack_id | P09 |
| pack_path | `OUTPUT/context/packs/P09.md` |
| retrieve_query | my tasks counters filters status group quick transition |
| max_chunks | 8 |
| validation_ok | yes |

## HOW

1. `src/features/tasks/filters.ts` — тип `MyTasksFilter` (`all | new | in_progress | on_review | rework | accepted`),
   сериализация в query-параметр и обратно; значение по умолчанию — `all`.
2. `src/features/tasks/useMyTasks.ts` — `useInfiniteQuery(['my-tasks', filter])` поверх `listMyTasks`;
   фильтр по статусу передаётся в PostgREST как `status=eq.<value>`, фильтр по исполнителю не
   передаётся — его делает RLS. Счётчики берутся из отдельного запроса агрегата по статусам
   (`GET /rest/v1/tasks?select=status&archived_at=is.null`), без `COUNT(*)` на сервере: клиент
   считает длины групп на загруженных страницах и показывает «20+», если страница не последняя.
3. `src/features/tasks/TaskRow.tsx` — строка: название, объект, бейдж статуса, дата, кнопка
   основного действия по `allowedTargets` (для исполнителя — одна кнопка).
4. `src/features/tasks/MyTasksPage.tsx` — вкладки по статусам с числами, пустое состояние
   «Задач нет» и подсказка, что делать; мобильная раскладка — карточки, десктоп — таблица.
5. Wire: после успешного перехода инвалидируются `['my-tasks']`, `['task']`, `['tasks']`;
   счётчик вкладки меняется из того же ответа RPC, без полной перезагрузки.

## INVARIANTS

1. Список содержит только задачи текущего пользователя; фильтр `assignee_id` не передаётся клиентом (SEC-04).
2. Счётчики не вычисляются через `COUNT(*)`; при неполной странице отображается «20+».
3. Переход из строки вызывает тот же RPC, что и карточка; другого пути нет (INV-003).
4. Исполнитель видит только доступные ему переходы; менеджер — только приёмку и возврат.
5. После перехода строка перемещается в другую вкладку без дублей.
6. Ошибка перехода не меняет ни статус, ни счётчики.
7. Архивные задачи в список не попадают.
8. Экран доступен с клавиатуры, вкладки — элементы с ролью `tab` (NFR-10).
9. Первый переход выполняется не более чем за два действия (NFR-11).

## ACCEPTANCE

| ID | Given | When | Then |
|----|-------|------|------|
| A09.1 | Исполнитель с 6 задачами в разных статусах | Открыть `/my` | Видны все 6, сгруппированы по статусам, счётчики совпадают |
| A09.2 | Два исполнителя | Исполнитель A открывает `/my` | Задач исполнителя B нет ни в одной вкладке |
| A09.3 | Задача `new` | Нажать «Взять в работу» в строке | Статус `in_progress`, строка перешла во вкладку «В работе» |
| A09.4 | Задача `on_review`, менеджер | Открыть `/my` | Доступны «Принять»/«На доработку», счётчик «На проверке» учитывает задачу |
| A09.5 | 25 задач, страница 20 | Открыть вкладку «Все» | Показано «20+», подгрузка добавляет остальные без дублей |
| A09.6 | Пустой список | Открыть `/my` | Пустое состояние с подсказкой, счётчики нулевые |

## FIT_CHECKS

| Поле | Значение |
|------|----------|
| module | crud-table |
| conflicts_ref | `OUTPUT/docs/07_conflicts.md#2-конфликты-с-архитектурными-решениями` |
| conflicts_applied | `crud-table` offset/COUNT |
| app_contracts | GET /rest/v1/tasks, POST /rest/v1/rpc/change_task_status |
| runtime_trace_required | no |
| invariants_skip | пусто |
| depends_done | D07, D08 |
| eco_invariants | design-tokens |
| acceptance_ops | A09.1, A09.3 |
| pre_ci | required |
| pre_release | required |

## VERIFICATION_TAX

| Поле | Значение |
|------|----------|
| level | L2 |
| verify_cmd | `sp-verify --d D09 --gate pre_ci` |
| evidence | `OUTPUT/evidence/D09.json` |
| done_forbidden_unless | `tax_pass=true`, A09.1–A09.6 покрыты |
| review | `sp review D09 --verdict supports` от ревьюера ≠ автор |

## PRODUCES

- `src/features/tasks/filters.ts` — создать
- `src/features/tasks/useMyTasks.ts` — создать
- `src/features/tasks/TaskRow.tsx` — создать
- `src/features/tasks/MyTasksPage.tsx` — создать
- `src/features/tasks/api.ts` — изменить (`ListMyTasksParams.status`; DEC-022)
- `src/app/router.tsx` — изменить (маршрут `/my`)

Тесты:

- `src/features/tasks/MyTasksPage.test.tsx` — A09.1, A09.2, A09.4, A09.6
- `src/features/tasks/TaskRow.test.tsx` — A09.3, A09.5

## НЕ ТРОГАТЬ

- `src/features/tasks/api.ts` — только необязательный `status` в `ListMyTasksParams` (DEC-022);
  остальной контракт D07 и `assignee_id` не меняются.
- `src/features/reports/**` — D12.

## PRE-CHECK

- [ ] D07, D08 `done`
- [ ] `P09.validation.json` → `ok: true`
- [ ] `size_ok: yes`
- [ ] Индекс `tasks(assignee_id, status)` существует (D02)

## ОГРАНИЧЕНИЯ

- Стек: React 18, TanStack Query.
- Типизация: `catalogs/typing-and-tests.md`, без `any`.
- Автотесты: Testing Library + MSW, кейсы `A09.*`.
- Комментарии: `catalogs/code-comments.md`, на русском, у логики счётчиков.
- VerificationTax: `done` после `pre_ci` и `acceptance_ids`.
- Context: только CONTEXT_PACK.
- NFR: NFR22 (≤30 с до перехода), NFR1 (список ≤400 мс).
- Доменные правила (≤12): группы по пяти статусам; архив не показывается; переход из строки
  равен переходу в карточке; исполнитель не видит менеджерских действий; счётчик «20+» вместо
  точного числа, если страница не последняя.
- Запрет: `COUNT(*)`, фильтр по `assignee_id` в запросе, дублирование `StatusPanel`.

## ТРЕБУЕМЫЙ ФОРМАТ ВЫВОДА

- Компоненты в PRODUCES.
- Тесты `A09.*`.
- Список файлов и описание вкладок в чате.
- Обновить test-plan и progress; после `tasks` — wave smoke.

## ЧЕКЛИСТ ПОСЛЕ ГЕНЕРАЦИИ

- [ ] Исполнитель видит только свои задачи
- [ ] Счётчики совпадают с содержимым вкладок
- [ ] Переход из строки работает и переносит задачу
- [ ] Пустое состояние и подгрузка страниц проверены
- [ ] `proof_debt` пуст

## STOP

Остановиться после PRODUCES и `pre_ci`; D10 не начинать.
