/**
 * Чтение и запись объектов через PostgREST.
 *
 * Инварианты:
 *  - `select` всегда перечисляет колонки: `select *` запрещён (T12, contracts-checklist);
 *  - пагинация keyset по `(title, id)`, без `offset` и `COUNT(*)`;
 *  - `archived_at` не принимается из входа и меняется только RPC D03;
 *  - пустой результат `PATCH` — это «не найдено/недоступно», а не успех (A05.6);
 *  - ответ БД валидируется Zod, поэтому лишние колонки не попадают в состояние.
 */
import { z } from 'zod';
import { PostgrestApiError, postgrestJson } from '../../shared/api/postgrest.js';
import { objectInputSchema, objectRowSchema } from './schema.js';
import type { ListObjectsParams, ObjectInput, ObjectPage, ObjectRow } from './types.js';

const OBJECT_SELECT = 'id,title,address,created_at,archived_at';

/** Ошибка валидации формы до сети: текст пригоден для показа рядом с полем. */
export class ObjectValidationError extends Error {
  readonly field: string | null;

  constructor(message: string, field: string | null) {
    super(message);
    this.name = 'ObjectValidationError';
    this.field = field;
  }
}

function parseInput(input: ObjectInput): ObjectInput {
  const parsed = objectInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ObjectValidationError(issue?.message ?? 'Проверьте заполнение полей', issue?.path[0]?.toString() ?? null);
  }
  return parsed.data;
}

function parseRows(value: unknown): ObjectRow[] {
  const parsed = z.array(objectRowSchema).safeParse(value);
  if (!parsed.success) {
    throw new PostgrestApiError('Не удалось загрузить объекты', 500);
  }
  return parsed.data;
}

/** Квотирует значение для `or`-фильтра PostgREST: запятые и кавычки не ломают выражение. */
function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Страница объектов. Запрашивается `limit + 1` строка: лишняя говорит, что есть следующая
 * страница, и не требует COUNT(*).
 */
export async function listObjects(params: ListObjectsParams = {}): Promise<ObjectPage> {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
  const search = new URLSearchParams({
    select: OBJECT_SELECT,
    order: 'title.asc,id.asc',
    limit: String(limit + 1),
  });

  if (!params.includeArchived) {
    search.set('archived_at', 'is.null');
  }
  if (params.cursor) {
    search.set(
      'or',
      `(title.gt.${quoteFilterValue(params.cursor.title)},and(title.eq.${quoteFilterValue(
        params.cursor.title,
      )},id.gt.${params.cursor.id}))`,
    );
  }

  const rows = parseRows(await postgrestJson(`objects?${search.toString()}`, { method: 'GET' }));
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && last ? { title: last.title, id: last.id } : null,
  };
}

/** Объект по id; архивный остаётся читаемым (INV-8). */
export async function getObject(id: string): Promise<ObjectRow> {
  const search = new URLSearchParams({
    select: OBJECT_SELECT,
    id: `eq.${id}`,
    limit: '1',
  });
  const rows = parseRows(await postgrestJson(`objects?${search.toString()}`, { method: 'GET' }));
  const row = rows[0];
  if (!row) {
    throw new PostgrestApiError('Объект не найден или недоступен', 404);
  }
  return row;
}

/** Создание объекта; служебные поля отбрасываются схемой (T12). */
export async function createObject(input: ObjectInput): Promise<ObjectRow> {
  const payload = parseInput(input);
  const rows = parseRows(
    await postgrestJson('objects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    }),
  );
  const row = rows[0];
  if (!row) {
    throw new PostgrestApiError('Не удалось создать объект', 500);
  }
  return row;
}

/** Правка полей; 0 строк означает «нет прав/не найдено», а не успех. */
export async function updateObject(id: string, input: ObjectInput): Promise<ObjectRow> {
  const payload = parseInput(input);
  const search = new URLSearchParams({ id: `eq.${id}` });
  const rows = parseRows(
    await postgrestJson(`objects?${search.toString()}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    }),
  );
  const row = rows[0];
  if (!row) {
    throw new PostgrestApiError('Объект не найден или недоступен', 404);
  }
  return row;
}
