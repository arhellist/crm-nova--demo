/**
 * Запросы экрана «Мои задачи»: страницы списка, счётчики вкладок и названия объектов.
 *
 * Инварианты:
 *  - список читается контрактом D07 (`listMyTasks`), пагинация keyset: без `offset`
 *    и без `COUNT(*)`; `assignee_id` клиент не передаёт никогда — видимость решает RLS (A09.2);
 *  - фильтр по статусу уходит на сервер как `status=eq.<value>` (DEC-022), поэтому
 *    вкладка не фильтрует уже загруженную страницу и не теряет «хвост» выборки;
 *  - счётчики — один агрегатный запрос `select=status` по доступным строкам: клиент считает
 *    статусы сам, без `COUNT(*)` на сервере; если агрегат упёрся в лимит, число помечается
 *    как неполное (A09.5);
 *  - названия объектов добираются пакетом `id=in.(...)`, без запроса на строку.
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { postgrestJson } from '../../shared/api/postgrest.js';
import { listMyTasks } from './api.js';
import { filterStatus, type MyTasksFilter } from './filters.js';
import { taskStatusSchema } from './schema.js';
import { taskKeys } from './useTask.js';
import type { TaskCursor, TaskPage, TaskStatus } from './types.js';

/** Размер страницы списка: ровно 20 строк, как в A09.5 (вторая страница — остаток). */
export const MY_TASKS_PAGE_SIZE = 20;

/** Потолок агрегатного запроса: больше 1000 строк PostgREST не отдаст по умолчанию. */
const COUNTER_ROW_LIMIT = 1000;

const statusRowsSchema = z.array(z.object({ status: taskStatusSchema }));

const objectTitleSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
});

/** Бесконечный список «моих задач» для выбранной вкладки. */
export function useMyTasks(filter: MyTasksFilter): {
  pages: TaskPage[];
  items: TaskPage['items'];
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
} {
  const status = filterStatus(filter);
  const query = useInfiniteQuery({
    queryKey: taskKeys.myTasks(filter),
    initialPageParam: null as TaskCursor | null,
    queryFn: ({ pageParam }) =>
      listMyTasks({ cursor: pageParam, limit: MY_TASKS_PAGE_SIZE, status: status ?? undefined }),
    getNextPageParam: (last) => last.nextCursor,
  });

  return {
    pages: query.data?.pages ?? [],
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    refetch: () => {
      void query.refetch();
    },
  };
}

export interface MyTasksCounters {
  counts: Record<MyTasksFilter, number>;
  /** `true`, если агрегат упёрся в лимит: точные числа неизвестны, показываем «+». */
  truncated: boolean;
  isLoading: boolean;
}

function emptyCounts(): Record<MyTasksFilter, number> {
  return { all: 0, new: 0, in_progress: 0, on_review: 0, rework: 0, accepted: 0 };
}

/**
 * Счётчики вкладок: один запрос статусов всех доступных строк.
 *
 * `COUNT(*)` не используется (инвариант 2 D09): сервер отдаёт только колонку `status`,
 * клиент складывает их по пяти статусам. Если строк пришло больше потолка, числа считаются
 * нижней оценкой и UI обязан показать «+».
 */
export function useMyTasksCounters(): MyTasksCounters {
  const query = useQuery({
    queryKey: ['my-tasks', 'counters'],
    queryFn: async (): Promise<{ counts: Record<MyTasksFilter, number>; truncated: boolean }> => {
      const search = new URLSearchParams({
        select: 'status',
        archived_at: 'is.null',
        limit: String(COUNTER_ROW_LIMIT + 1),
      });
      const value = await postgrestJson(`tasks?${search.toString()}`, { method: 'GET' });
      const parsed = statusRowsSchema.safeParse(value);
      if (!parsed.success) {
        throw new Error('Не удалось загрузить счётчики задач');
      }
      const counts = emptyCounts();
      for (const row of parsed.data.slice(0, COUNTER_ROW_LIMIT)) {
        counts[row.status] += 1;
        counts.all += 1;
      }
      return { counts, truncated: parsed.data.length > COUNTER_ROW_LIMIT };
    },
  });

  return {
    counts: query.data?.counts ?? emptyCounts(),
    truncated: query.data?.truncated ?? false,
    isLoading: query.isLoading,
  };
}

/** Названия объектов для строк списка: `{ object_id: title }`. */
export function useObjectTitles(ids: readonly string[]): Record<string, string> {
  const unique = [...new Set(ids)].filter((id) => id.length > 0);
  const query = useQuery({
    queryKey: ['object-titles', [...unique].sort()],
    enabled: unique.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const search = new URLSearchParams({
        select: 'id,title',
        id: `in.(${unique.join(',')})`,
      });
      const value = await postgrestJson(`objects?${search.toString()}`, { method: 'GET' });
      const parsed = z.array(objectTitleSchema).safeParse(value);
      if (!parsed.success) {
        throw new Error('Не удалось загрузить объекты');
      }
      const map: Record<string, string> = {};
      for (const row of parsed.data) {
        map[row.id] = row.title;
      }
      return map;
    },
  });
  return query.data ?? {};
}

/** Статусы в порядке цикла — для группировки вкладки «Все». */
export const MY_TASKS_STATUS_ORDER: readonly TaskStatus[] = [
  'new',
  'in_progress',
  'on_review',
  'rework',
  'accepted',
];
