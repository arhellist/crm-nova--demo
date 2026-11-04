# Test plan — D09 («Мои задачи»)

| ID | Фраза | Тест | Статус |
|----|-------|------|--------|
| A09.1 | Все свои задачи по статусам, счётчики совпадают | `src/features/tasks/MyTasksPage.test.tsx` | covered |
| A09.2 | Чужих задач нет | `src/features/tasks/MyTasksPage.test.tsx` | covered |
| A09.3 | Переход из строки переносит задачу | `src/features/tasks/TaskRow.test.tsx` | covered |
| A09.4 | Менеджер видит приёмку и возврат | `src/features/tasks/MyTasksPage.test.tsx` | covered |
| A09.5 | «20+» и подгрузка без дублей | `src/features/tasks/TaskRow.test.tsx` | covered |
| A09.6 | Пустое состояние и нулевые счётчики | `src/features/tasks/MyTasksPage.test.tsx` | covered |
