/**
 * Запросы карточки задачи: сама задача, её история и имена участников.
 *
 * Инварианты:
 *  - задача читается контрактом D07 (`getTask`), история — отдельным запросом к
 *    `task_status_history` только на чтение (INV-004): запись делает триггер;
 *  - история сортируется `created_at.desc,id.desc`, поэтому первая строка — последний переход;
 *  - имена берутся из `profiles` пакетом (`id=in.(...)`), без запроса на каждую строку;
 *  - архивная задача для RLS не существует (DEC-017): запрос вернёт 404, экран покажет «не найдена».
 */
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { postgrestJson } from '../../shared/api/postgrest.js';
import { getTask } from './api.js';
import { taskStatusSchema } from './schema.js';
import type { TaskRow, TaskStatus } from './types.js';

/** Одна строка аудита: `from_status = null` означает создание задачи. */
export interface TaskHistoryRow {
  id: number;
  from_status: TaskStatus | null;
  to_status: TaskStatus;
  changed_by: string;
  comment: string | null;
  created_at: string;
}

const historyRowSchema = z.object({
  id: z.coerce.number().int(),
  from_status: taskStatusSchema.nullable(),
  to_status: taskStatusSchema,
  changed_by: z.string().uuid(),
  comment: z.string().max(2000).nullable(),
  created_at: z.string().min(1),
});

const profileRowSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(1).max(120),
});

export const taskKeys = {
  all: ['tasks'] as const,
  detail: (id: string) => ['task', id] as const,
  history: (id: string) => ['task-history', id] as const,
  myTasks: (filter: string) => ['my-tasks', filter] as const,
  people: (ids: readonly string[]) => ['people', [...ids].sort()] as const,
};

/** Карточка задачи; `staleTime` не задаём: статус должен быть свежим после перехода. */
export function useTask(id: string): {
  task: TaskRow | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({ queryKey: taskKeys.detail(id), queryFn: () => getTask(id) });
  return { task: query.data, isLoading: query.isLoading, isError: query.isError };
}

/** История переходов от новых к старым (A08.6). */
export function useTaskHistory(id: string): {
  rows: TaskHistoryRow[];
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: taskKeys.history(id),
    queryFn: async (): Promise<TaskHistoryRow[]> => {
      const search = new URLSearchParams({
        select: 'id,from_status,to_status,changed_by,comment,created_at',
        task_id: `eq.${id}`,
        order: 'created_at.desc,id.desc',
        limit: '100',
      });
      const value = await postgrestJson(`task_status_history?${search.toString()}`, {
        method: 'GET',
      });
      const parsed = z.array(historyRowSchema).safeParse(value);
      if (!parsed.success) {
        throw new Error('Не удалось загрузить историю задачи');
      }
      return parsed.data;
    },
  });
  return { rows: query.data ?? [], isLoading: query.isLoading, isError: query.isError };
}

/** Пакет имён участников: `{ uuid: full_name }`, без email (INV-011 по духу отчётов и UI). */
export function useTaskPeople(ids: readonly string[]): Record<string, string> {
  const unique = [...new Set(ids)].filter((id) => id.length > 0);
  const query = useQuery({
    queryKey: taskKeys.people(unique),
    enabled: unique.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const search = new URLSearchParams({
        select: 'id,full_name',
        id: `in.(${unique.join(',')})`,
      });
      const value = await postgrestJson(`profiles?${search.toString()}`, { method: 'GET' });
      const parsed = z.array(profileRowSchema).safeParse(value);
      if (!parsed.success) {
        throw new Error('Не удалось загрузить участников');
      }
      const map: Record<string, string> = {};
      for (const profile of parsed.data) {
        map[profile.id] = profile.full_name;
      }
      return map;
    },
  });
  return query.data ?? {};
}

/** Исполнители для выбора в форме: только роль `executor` (assignee должен быть исполнителем). */
export function useExecutors(): { items: Array<{ id: string; full_name: string }>; isLoading: boolean } {
  const query = useQuery({
    queryKey: ['profiles', 'executors'],
    queryFn: async (): Promise<Array<{ id: string; full_name: string }>> => {
      const search = new URLSearchParams({
        select: 'id,full_name',
        role: 'eq.executor',
        order: 'full_name.asc',
      });
      const value = await postgrestJson(`profiles?${search.toString()}`, { method: 'GET' });
      const parsed = z.array(profileRowSchema).safeParse(value);
      if (!parsed.success) {
        throw new Error('Не удалось загрузить исполнителей');
      }
      return parsed.data;
    },
  });
  return { items: query.data ?? [], isLoading: query.isLoading };
}
