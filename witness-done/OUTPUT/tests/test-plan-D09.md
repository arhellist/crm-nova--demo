# Test plan — D09 («Мои задачи»)

| ID | Фраза | Тест | Статус |
|----|-------|------|--------|
| A09.1 | Исполнитель видит 6 задач по статусам, счётчики совпадают | `src/features/tasks/MyTasksPage.test.tsx` | covered |
| A09.2 | Чужие задачи не видны, `assignee_id` не передаётся | `src/features/tasks/MyTasksPage.test.tsx` | covered |
| A09.3 | «Взять в работу» из строки переносит задачу во вкладку | `src/features/tasks/TaskRow.test.tsx` | covered |
| A09.4 | Менеджер видит «Принять»/«На доработку», счётчик учитывает задачу | `src/features/tasks/MyTasksPage.test.tsx` | covered |
| A09.5 | 25 задач: «20+», подгрузка без дублей | `src/features/tasks/TaskRow.test.tsx` | covered |
| A09.6 | Пустой список: подсказка и нулевые счётчики | `src/features/tasks/MyTasksPage.test.tsx` | covered |

Дополнительно: `src/features/tasks/api.test.ts` проверяет, что `status=eq.<value>` попадает
в запрос, а `assignee_id` — нет (DEC-022).
