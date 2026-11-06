# DEC-065 — Бесконечная рекурсия RLS tasks ↔ objects

| Поле | Значение |
|------|----------|
| Дата | 2026-11-06 |
| Intake | 20261106-2330-net-nikakih-izmeneniya-irina-volkova-kar |
| Статус | принято |
| ADR | — |
| Заменяет | уточняет реализацию DEC-062 (каскадное скрытие) |

**Контекст.** После DEC-062 `tasks_select` проверял `EXISTS (objects …)`, а
`objects_select` для исполнителя — `EXISTS (tasks …)`. Postgres при OR в политике
объектов заходил в обе ветки → `infinite recursion detected in policy for relation
"tasks"`. PostgREST отдавал ошибку; «Мои задачи» показывали нули по статусам.

**Решение.** Хелпер `public.object_is_active(uuid)` (`security definer`,
`search_path = public, pg_temp`, execute только у `authenticated`). `tasks_select`
вызывает его вместо прямого `EXISTS` по `objects`. Вьюха `report_managers` без
изменений.

**Альтернативы.** Убрать каскад из RLS и оставить только во вьюхе — отвергнуто:
UI «Мои задачи» снова показывал бы задачи архивных объектов. Переписать
`objects_select` без ссылки на tasks — ломает доступ исполнителя к объектам.

**Чем подтверждено.** Миграция `0012_…`; SELECT as authenticated без recursion;
демо «Мои задачи» с ненулевыми вкладками.
