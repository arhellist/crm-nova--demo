# Delta: tasks — заморозка статуса после принятия

## ADDED Requirements

### Requirement: После принятия смена статуса заморожена в UI

После перехода в `accepted` система MUST не предлагать действий смены статуса в карточке
и в строке «Мои задачи». UI SHALL сразу после успешного ответа RPC считать статус
терминальным (без ожидания полного refetch) и показать явную фиксацию.

#### Scenario: happy path
- GIVEN задача в `on_review`, роль manager
- WHEN менеджер нажимает «Принять» и RPC успешен
- THEN кнопки переходов исчезают и видна подпись о фиксации статуса

#### Scenario: negative — повторный переход из accepted
- GIVEN задача уже в `accepted`
- WHEN клиент вызывает `change_task_status` с любым target
- THEN сервер отклоняет `P0422`, статус не меняется (существующее поведение БД)

## MODIFIED Requirements

—

## REMOVED Requirements

—
