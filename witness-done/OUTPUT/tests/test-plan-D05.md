# Test plan — D05 (контракт объектов)

| ID | Фраза | Тест | Статус |
|----|-------|------|--------|
| A05.1 | Создание объекта менеджером | `src/features/objects/api.test.ts` | covered |
| A05.2 | Пустое название → ошибка до сети | `src/features/objects/schema.test.ts` | covered |
| A05.3 | Исполнитель не создаёт объект | `src/features/objects/authz.test.ts` | covered |
| A05.4 | Keyset-пагинация без дублей | `src/features/objects/api.test.ts` | covered |
| A05.5 | SQL-подобная строка сохраняется как текст | `src/features/objects/api.test.ts` | covered |
| A05.6 | Правка чужого объекта → 0 строк | `src/features/objects/authz.test.ts` | covered |

## Ops

| ID | Проверка внешним контуром |
|----|---------------------------|
| A05.1 | `scripts/smoke/wave-api-smoke.sh objects` | `src/features/objects/api.test.ts` |
| A05.3 | `scripts/smoke/wave-api-smoke.sh objects` | `src/features/objects/authz.test.ts` |
