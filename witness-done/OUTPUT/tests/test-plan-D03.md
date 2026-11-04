# Test plan — D03 (машина статусов)

| ID | Фраза | Тест | Статус |
|----|-------|------|--------|
| A03.1 | Разрешённый переход исполнителя + строка истории | `supabase/tests/transitions_test.sql` | covered |
| A03.2 | Запрещённый переход менеджера → `P0422` | `supabase/tests/transitions_test.sql` | covered |
| A03.3 | `on_review → accepted` менеджером | `supabase/tests/transitions_test.sql` | covered |
| A03.4 | Чужая задача → `P0403`, истории нет | `supabase/tests/transitions_test.sql` | covered |
| A03.5 | Возврат без комментария → `P0422` | `supabase/tests/transitions_test.sql` | covered |
| A03.1–A03.5 | Матрица 5×5: 5 проходят, 20 отклоняются | `supabase/tests/transitions_test.sql` | covered |
| A03.6 | Прямой `update status` отклонён guard-триггером | `supabase/tests/history_test.sql` | covered |
| A03.7 | `insert` в историю запрещён | `supabase/tests/history_test.sql` | covered |
| A03.8 | Повторное архивирование идемпотентно | `supabase/tests/archive_test.sql` | covered |

## Ops

| ID | Проверка внешним контуром |
|----|---------------------------|
| A03.1 | `scripts/smoke/wave-api-smoke.sh schema` |
| A03.2 | `scripts/smoke/wave-api-smoke.sh schema` |
