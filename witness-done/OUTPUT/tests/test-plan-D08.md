# Test plan — D08 (экран задачи)

| ID | Фраза | Тест | Статус |
|----|-------|------|--------|
| A08.1 | Исполнитель видит одну кнопку перехода | `src/features/tasks/TaskPage.test.tsx` | covered |
| A08.2 | Менеджер видит приёмку и возврат | `src/features/tasks/TaskPage.test.tsx` | covered |
| A08.3 | Возврат без комментария не отправляется | `src/features/tasks/StatusPanel.test.tsx` | covered |
| A08.4 | Успешный возврат с комментарием в истории | `src/features/tasks/StatusPanel.test.tsx` | covered |
| A08.5 | Запрещённый переход → ошибка, статус прежний | `src/features/tasks/StatusPanel.test.tsx` | covered |
| A08.6 | История от новых к старым, акторы — имена | `src/features/tasks/TaskPage.test.tsx` | covered |
