/**
 * Контракт задачи: поля §3.3 `data-model.md` и вход, который разрешено слать клиенту.
 *
 * Служебные значения (`status`, `author_id`, `archived_at`, `created_at`, `updated_at`)
 * приходят только с сервера: статус меняет RPC D03, автора ставит БД из `auth.uid()`.
 * Поэтому во входе их нет — массовое присвоение через форму невозможно (T14).
 */
export type TaskStatus = 'new' | 'in_progress' | 'on_review' | 'rework' | 'accepted';

export type UserRole = 'manager' | 'executor';

export interface TaskRow {
  id: string;
  object_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignee_id: string;
  author_id: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

/** Вход создания/правки: только поля, которые разрешено писать напрямую. */
export interface TaskInput {
  object_id: string;
  title: string;
  description?: string;
  assignee_id: string;
}

/** Курсор keyset-пагинации: сортировка `created_at.desc,id.desc`. */
export interface TaskCursor {
  created_at: string;
  id: string;
}

export interface ListTasksParams {
  cursor?: TaskCursor | null;
  limit?: number;
}

export interface TaskPage {
  items: TaskRow[];
  nextCursor: TaskCursor | null;
}
