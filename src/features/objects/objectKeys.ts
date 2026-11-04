/**
 * Ключи кэша объектов в TanStack Query.
 *
 * Зачем отдельный модуль: список, карточка и задачи объекта должны инвалидироваться точечно,
 * а не «весь кэш». Префикс `['objects']` — все списки (его использует RPC архивирования
 * из D05), `['object', id]` — карточка, `['tasks', { objectId }]` — задачи объекта (D07).
 *
 * Курсор пагинации в ключ списка НЕ входит: он живёт в `pageParam` бесконечного запроса,
 * иначе каждая страница считалась бы новым запросом и кэш рос бы без переиспользования.
 */
export interface ObjectListKeyParams {
  includeArchived: boolean;
}

export const objectKeys = {
  all: ['objects'] as const,
  lists: () => [...objectKeys.all, 'list'] as const,
  list: (params: ObjectListKeyParams) => [...objectKeys.lists(), params] as const,
  detail: (id: string) => ['object', id] as const,
  tasks: (objectId: string) => ['tasks', { objectId }] as const,
};
