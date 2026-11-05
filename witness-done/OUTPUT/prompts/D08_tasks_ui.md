# === DEV PROMPT: D08_tasks_ui ===

РОЛЬ: frontend

GATE: none

ЗАВИСИТ ОТ: D07, D03, D04

## SIZE_BUDGET

| Поле | Значение |
|------|----------|
| surfaces | ui |
| produces_count | 5 |
| entity | task |
| delivery_slice | S5 |
| split_group | tasks |
| split_from | none |
| size_ok | yes |

## ЦЕЛЬ

Дать экран задачи: карточка с историей, форма создания с назначением, панель переходов по роли —
так, чтобы исполнитель двигал задачу одной кнопкой, а менеджер принимал и возвращал.

## CONSUMES

- `OUTPUT/docs/design-notes.md` — токены статусов (`Badge`), карточка, панель кнопок
- `OUTPUT/prompts/D07_tasks_contract.md` — `TaskRow`, `changeTaskStatus`, `allowedTargets`
- `OUTPUT/specs/domain-rules.md` — матрица переходов, обязательный комментарий возврата
- `OUTPUT/specs/data-model.md` — §3.4 `task_status_history` (поля истории)
- `OUTPUT/security/authn-authz.md` — SEC-04, SEC-07
- `OUTPUT/docs/nfr.md` — NFR2 (переход ≤600 мс), NFR22 (≤30 с до действия)

## CONTEXT_PACK

| Поле | Значение |
|------|----------|
| pack_id | P08 |
| pack_path | `OUTPUT/context/packs/P08.md` |
| retrieve_query | task card status panel history transitions comment rework design |
| max_chunks | 9 |
| validation_ok | yes |

## HOW

1. `src/features/tasks/useTask.ts` — `useQuery(['task', id])` для `TaskRow` и `useQuery(['task-history', id])`
   для истории `select id, from_status, to_status, actor_id, comment, created_at order by created_at desc`;
   обе инвалидируются после смены статуса.
2. `src/features/tasks/TaskPage.tsx` — заголовок, описание, бейдж статуса, исполнитель, автор,
   дата; при `archived_at` — бейдж «Архив» и отключённые действия.
3. `src/features/tasks/StatusPanel.tsx` — кнопки только из `allowedTargets(status, role)`; переход
   `on_review → rework` открывает поле комментария и блокирует отправку при пустом значении;
   остальные переходы — одно действие без диалога. Во время мутации кнопки disabled.
4. `src/features/tasks/HistoryList.tsx` — от новых к старым: «Создана», «В работу», «На проверку»,
   «Принята», «На доработку»; текст комментария показывается под строкой возврата; актор — имя из `profiles`.
5. `src/features/tasks/TaskForm.tsx` — создание и правка: название, описание, исполнитель (select
   из `profiles` с ролью `executor`), объект фиксирован при создании из карточки объекта;
   смена исполнителя доступна только в `new`/`rework`.
6. Wire: после успешного перехода панель перерисовывается из ответа RPC, затем инвалидируются
   `['task']`, `['task-history']`, `['my-tasks']`, `['tasks']`; оптимистичных обновлений статуса нет.

## INVARIANTS

1. UI не единственная проверка: каждая кнопка соответствует `domain-rules.md`, сервер проверяет повторно (INV-002).
2. Исполнитель видит в панели только `new→in_progress`, `in_progress→on_review`, `rework→in_progress`.
3. Менеджер видит `on_review→accepted` и `on_review→rework`; остальные кнопки отсутствуют.
4. Возврат на доработку без комментария не отправляется; после ответа сервера комментарий виден в истории.
5. Статус на экране меняется только после успешного ответа RPC, не оптимистично.
6. Ошибка перехода показывается сообщением, статус и история остаются прежними.
7. История отсортирована по времени убыванию, содержит строку создания.
8. Архивная задача не предлагает переходов.
9. Токены статусов берутся из `design-notes.md`; статус подписан текстом, не только цветом (NFR-10).
10. Поля формы и кнопки доступны с клавиатуры, фокус после открытия диалога — в первом поле.

## ACCEPTANCE

| ID | Given | When | Then |
|----|-------|------|------|
| A08.1 | Задача `new`, исполнитель — владелец | Открыть карточку | Одна кнопка «Взять в работу», других переходов нет |
| A08.2 | Задача `on_review`, менеджер | Открыть карточку | Кнопки «Принять» и «На доработку», кнопки исполнителя отсутствуют |
| A08.3 | Задача `on_review`, менеджер | Нажать «На доработку» с пустым комментарием | Отправки нет, поле подсвечено ошибкой |
| A08.4 | Задача `on_review` | Успешный возврат с комментарием | Статус `rework`, комментарий появился первой строкой истории |
| A08.5 | Задача `accepted` | Попытка вызвать `changeTaskStatus('in_progress')` из консоли | Сообщение об ошибке, статус не изменился |
| A08.6 | Задача с историей из 4 переходов | Открыть карточку | 5 строк (создание + 4), порядок от новых к старым, акторы — имена |

## FIT_CHECKS

| Поле | Значение |
|------|----------|
| module | crud-table |
| conflicts_ref | `OUTPUT/docs/07_conflicts.md#1-конфликты-включённых-модулей` |
| conflicts_applied | `crud-table × auth-jwt` |
| app_contracts | GET /rest/v1/tasks, POST /rest/v1/rpc/change_task_status |
| runtime_trace_required | no |
| invariants_skip | пусто |
| depends_done | D03, D04, D07 |
| eco_invariants | design-tokens |
| acceptance_ops | A08.2, A08.4 |
| pre_ci | required |
| pre_release | required |

## VERIFICATION_TAX

| Поле | Значение |
|------|----------|
| level | L2 |
| verify_cmd | `sp-verify --d D08 --gate pre_ci` |
| evidence | `OUTPUT/evidence/D08.json` |
| done_forbidden_unless | `tax_pass=true`, A08.1–A08.6 покрыты, `ops_checked` непуст |
| review | `sp review D08 --verdict supports` от ревьюера ≠ автор |

## PRODUCES

- `src/features/tasks/useTask.ts` — создать
- `src/features/tasks/TaskPage.tsx` — создать
- `src/features/tasks/StatusPanel.tsx` — создать
- `src/features/tasks/HistoryList.tsx` — создать
- `src/features/tasks/TaskForm.tsx` — создать

Тесты:

- `src/features/tasks/TaskPage.test.tsx` — A08.1, A08.2, A08.6
- `src/features/tasks/StatusPanel.test.tsx` — A08.3, A08.4, A08.5

## НЕ ТРОГАТЬ

- `src/features/tasks/api.ts`, `mutations.ts`, `transitions.ts` — контракт D07.
- `src/features/reports/**` — D12.

## PRE-CHECK

- [ ] D07 `done`, `changeTaskStatus` и `allowedTargets` экспортированы
- [ ] `P08.validation.json` → `ok: true`
- [ ] `size_ok: yes`
- [ ] `design-notes.md` содержит токены пяти статусов

## ОГРАНИЧЕНИЯ

- Стек: React 18, TanStack Query, React Router 6.
- Типизация: `catalogs/typing-and-tests.md`, без `any`.
- Автотесты: Testing Library + MSW, кейсы `A08.*`.
- Комментарии: `catalogs/code-comments.md`, на русском, у панели переходов.
- VerificationTax: `done` после `pre_ci` и `acceptance_ids`.
- Context: только CONTEXT_PACK.
- Дизайн: `design-notes.md`, статусы — текстом и цветом.
- NFR: NFR2 (переход ≤600 мс), NFR22 (≤30 с до действия).
- Доменные правила (≤12): пять подписей переходов; комментарий обязателен только на возврате;
  архивная задача без действий; исполнитель не видит менеджерских кнопок; история неизменяема.
- Запрет: оптимистично менять статус; скрывать кнопку вместо серверной проверки.

## ТРЕБУЕМЫЙ ФОРМАТ ВЫВОДА

- Компоненты в PRODUCES.
- Тесты `A08.*`.
- Список файлов и перечень состояний панели статусов.
- Обновить test-plan и progress; после `tasks` — wave smoke.

## ЧЕКЛИСТ ПОСЛЕ ГЕНЕРАЦИИ

- [ ] Панель соответствует матрице для обеих ролей
- [ ] Возврат без комментария невозможен в UI
- [ ] История от новых к старым, акторы — реальные пользователи
- [ ] Статус меняется только после ответа RPC
- [ ] `proof_debt` пуст

## STOP

Остановиться после PRODUCES и `pre_ci`; D09 не начинать.
