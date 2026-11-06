# Proposal: счётчики статусов в карточках менеджеров

| Поле | Значение |
|------|----------|
| Статус | done |
| Автор | cursor-agent |
| Дата | 2026-11-06 |
| Intake | 20261106-2311-v-kartochkah-menedzherov-ne-verno-pokazy |
| Затрагиваемые домены | reports, RLS tasks |
| Решение | DEC-062 |

## 1. Контекст

В карточках `/team` в `tasks_total` и разбивку по статусам попадали задачи с архивных
объектов (у строк `tasks.archived_at is null`, но `objects.archived_at` задан). По схеме
задачи архивного объекта должны скрываться каскадно, а `report_objects` уже исключает
архивные объекты — отсюда расхождение «карточка vs объекты».

## 2. Решение

`report_managers` считает только задачи с `objects.archived_at is null`; политика
`tasks_select` — то же условие (DEC-062).

## 3. Non-goals

Каскадное проставление `tasks.archived_at` при архиве объекта; KPI исполнителей.
