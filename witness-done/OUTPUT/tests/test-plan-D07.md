# Test plan — D07 (контракт задач)

| ID | Фраза | Тест | Статус |
|----|-------|------|--------|
| A07.1 | Создание задачи со статусом `new` | `src/features/tasks/api.test.ts` | covered |
| A07.2 | Исполнитель не создаёт задачу | `src/features/tasks/api.test.ts` | covered |
| A07.3 | Переход в работу | `src/features/tasks/mutations.test.ts` | covered |
| A07.4 | Запрещённый переход из `accepted` | `src/features/tasks/mutations.test.ts` | covered |
| A07.5 | Смена исполнителя запрещена в `in_progress` | `src/features/tasks/mutations.test.ts` | covered |
| A07.6 | Страницы задач без дублей | `src/features/tasks/api.test.ts` | covered |
| A07.7 | Чужая задача недоступна | `src/features/tasks/api.test.ts` | covered |
