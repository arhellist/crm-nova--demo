/**
 * Контракт объекта: только поля §3.2 `data-model.md`.
 *
 * Служебные поля (`id`, `created_at`, `archived_at`) — только чтение: во входе их нет,
 * поэтому массовое присвоение через форму невозможно (T12).
 */
export interface ObjectRow {
  id: string;
  title: string;
  address: string;
  created_at: string;
  archived_at: string | null;
}

/** Вход создания/правки: ровно два редактируемых поля. */
export interface ObjectInput {
  title: string;
  address: string;
}

/** Курсор keyset-пагинации: сортировка `title.asc,id.asc`. */
export interface ObjectCursor {
  title: string;
  id: string;
}

export interface ListObjectsParams {
  cursor?: ObjectCursor | null;
  limit?: number;
  includeArchived?: boolean;
}

export interface ObjectPage {
  items: ObjectRow[];
  nextCursor: ObjectCursor | null;
}
