/**
 * Чтение задач и запись полей через PostgREST.
 *
 * Инварианты:
 *  - `select` перечисляет колонки: `select *` запрещён (contracts-checklist);
 *  - пагинация keyset по `(created_at, id)` в порядке `created_at.desc,id.desc`, без `offset`
 *    и `COUNT(*)` (A07.6);
 *  - фильтр «мои задачи» не передаётся: видимость решает RLS по `assignee_id = auth.uid()`;
 *  - `status` и `author_id` отсутствуют во входе: статус ставит БД, автора — `auth.uid()`;
 *  - ошибки PostgREST переводятся в доменные сообщения по `code` и машинному `serverMessage`;
 *    SQLSTATE и детали БД наружу не отдаются (INV-007).
 */
import { z } from 'zod';
import { PostgrestApiError, postgrestJson } from '../../shared/api/postgrest.js';
import { taskInputSchema, taskRowSchema, taskStatusSchema } from './schema.js';
import type { ListTasksParams, TaskInput, TaskPage, TaskRow, TaskStatus } from './types.js';

const TASK_SELECT =
  'id,object_id,title,description,status,assignee_id,author_id,created_at,updated_at,archived_at';

/** Доменная ошибка контракта задачи: `status` — HTTP-подобный код, текст безопасен для UI. */
export class TaskApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'TaskApiError';
    this.status = status;
  }
}

/**
 * Маппинг ошибок PostgREST/RPC в сообщения пользователю.
 *
 * Один SQLSTATE `P0422` покрывает три разных причины, поэтому различаем их по машинному
 * `serverMessage`: недопустимый переход, отсутствие комментария возврата, смена исполнителя
 * в запрещённом статусе. Порядок важен: сначала более конкретные причины.
 */
export function toTaskError(
  error: unknown,
  fallback = 'Не удалось выполнить действие с задачей',
): Error {
  if (error instanceof TaskApiError) {
    return error;
  }
  if (error instanceof PostgrestApiError) {
    const server = error.serverMessage ?? '';
    if (error.code === 'P0422') {
      if (server === 'comment_required') {
        return new TaskApiError('Опишите, что доработать', 422);
      }
      if (server === 'assignee_change_not_allowed') {
        return new TaskApiError(
          'Исполнителя можно менять только в статусах «Новая» и «На доработке»',
          422,
        );
      }
      if (server === 'transition_not_allowed') {
        return new TaskApiError('Этот переход недоступен', 422);
      }
      return new TaskApiError('Недопустимое действие для текущего статуса', 422);
    }
    if (error.code === 'P0403' || error.status === 403) {
      return new TaskApiError('Недостаточно прав', 403);
    }
    if (error.code === 'P0400' || error.status === 404) {
      return new TaskApiError('Задача не найдена', 404);
    }
  }
  if (error instanceof Error && error.message) {
    return new TaskApiError(fallback, 500);
  }
  return new TaskApiError(fallback, 500);
}

/** Квотирует значение для `or`-фильтра: двоеточия и запятые не ломают выражение. */
function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function parseInput(input: TaskInput): TaskInput {
  const parsed = taskInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new TaskApiError(issue?.message ?? 'Проверьте заполнение полей', 400);
  }
  return parsed.data;
}

function parseRows(value: unknown, fallback: string): TaskRow[] {
  const parsed = z.array(taskRowSchema).safeParse(value);
  if (!parsed.success) {
    throw new TaskApiError(fallback, 500);
  }
  return parsed.data;
}

function parseUuid(id: string, fallback: string): string {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) {
    throw new TaskApiError(fallback, 404);
  }
  return parsed.data;
}

/** Общая часть списков: фильтры задаёт вызывающий, пагинация и сортировка — здесь. */
async function listTasks(
  filter: Record<string, string>,
  params: ListTasksParams,
  fallback: string,
): Promise<TaskPage> {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
  const search = new URLSearchParams({
    select: TASK_SELECT,
    order: 'created_at.desc,id.desc',
    limit: String(limit + 1),
    archived_at: 'is.null',
    ...filter,
  });

  if (params.cursor) {
    const at = quoteFilterValue(params.cursor.created_at);
    search.set(
      'or',
      `(created_at.lt.${at},and(created_at.eq.${at},id.lt.${params.cursor.id}))`,
    );
  }

  let value: unknown;
  try {
    value = await postgrestJson(`tasks?${search.toString()}`, { method: 'GET' });
  } catch (error) {
    throw toTaskError(error, fallback);
  }

  const rows = parseRows(value, fallback);
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last ? { created_at: last.created_at, id: last.id } : null,
  };
}

/** Задачи объекта в порядке `created_at.desc`; видимость ограничена RLS. */
export async function listTasksByObject(
  objectId: string,
  params: ListTasksParams = {},
): Promise<TaskPage> {
  const id = parseUuid(objectId, 'Объект не найден');
  return listTasks({ object_id: `eq.${id}` }, params, 'Не удалось загрузить задачи объекта');
}

/**
 * Параметры «Моих задач»: необязательный фильтр по статусу (DEC-022).
 *
 * `assignee_id` сюда не входит и не передаётся: видимость решает RLS (SEC-04).
 */
export interface ListMyTasksParams extends ListTasksParams {
  status?: TaskStatus;
}

/** «Мои задачи»: фильтр по исполнителю делает RLS, параметр `assignee_id` не передаётся. */
export async function listMyTasks(params: ListMyTasksParams = {}): Promise<TaskPage> {
  const filter: Record<string, string> = params.status ? { status: `eq.${params.status}` } : {};
  return listTasks(filter, params, 'Не удалось загрузить задачи');
}

/** Задача по id; чужая или архивная для RLS не существует (A07.7). */
export async function getTask(id: string): Promise<TaskRow> {
  const taskId = parseUuid(id, 'Задача не найдена');
  const search = new URLSearchParams({
    select: TASK_SELECT,
    id: `eq.${taskId}`,
    limit: '1',
  });

  let value: unknown;
  try {
    value = await postgrestJson(`tasks?${search.toString()}`, { method: 'GET' });
  } catch (error) {
    throw toTaskError(error, 'Не удалось загрузить задачу');
  }

  const rows = parseRows(value, 'Не удалось загрузить задачу');
  const row = rows.at(0);
  if (!row) {
    throw new TaskApiError('Задача не найдена', 404);
  }
  return row;
}

/** Создание задачи: `status` не отправляется, БД ставит `new` (A07.1). */
export async function createTask(input: TaskInput): Promise<TaskRow> {
  const payload = parseInput(input);

  let value: unknown;
  try {
    value = await postgrestJson('tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw toTaskError(error, 'Не удалось создать задачу');
  }

  const rows = parseRows(value, 'Не удалось создать задачу');
  const row = rows.at(0);
  if (!row) {
    throw new TaskApiError('Не удалось создать задачу', 500);
  }
  return row;
}

/**
 * Правка полей задачи. `status` в тело не попадает, смена исполнителя возможна только
 * в `new`/`rework` — это проверяет триггер БД, клиент лишь показывает отказ (A07.5).
 */
export async function updateTask(id: string, input: TaskInput): Promise<TaskRow> {
  const taskId = parseUuid(id, 'Задача не найдена');
  const payload = parseInput(input);
  const search = new URLSearchParams({ id: `eq.${taskId}` });

  let value: unknown;
  try {
    value = await postgrestJson(`tasks?${search.toString()}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw toTaskError(error, 'Не удалось сохранить задачу');
  }

  const rows = parseRows(value, 'Не удалось сохранить задачу');
  const row = rows.at(0);
  if (!row) {
    throw new TaskApiError('Задача не найдена', 404);
  }
  return row;
}

/** Статус из ответа RPC: PostgREST отдаёт скаляр, но принимаем и обёртку `{ status }`. */
export function parseRpcStatus(value: unknown): TaskStatus {
  const scalar = taskStatusSchema.safeParse(value);
  if (scalar.success) {
    return scalar.data;
  }
  const wrapped = z.object({ status: taskStatusSchema }).safeParse(value);
  if (wrapped.success) {
    return wrapped.data.status;
  }
  throw new TaskApiError('Сервер вернул неизвестный статус', 500);
}
