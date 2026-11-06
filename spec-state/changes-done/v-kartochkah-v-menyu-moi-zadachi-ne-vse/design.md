# Design: полные поля задачи

- `TaskRow`: блок полей название, описание (clamp), объект, исполнитель, автор, статус, дата + действия.
- `MyTasksPage`: `useTaskPeople` по assignee_id/author_id списка.
- `TaskPage`: в `dl` добавить «Объект» (title через `useObjectTitles`); статус уже в шапке — продублировать в dl для полного набора подписей.
