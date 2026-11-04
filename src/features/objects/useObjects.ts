/**
 * Бесконечный список объектов поверх контракта D05.
 *
 * Инварианты:
 *  - страницы запрашиваются курсором `nextCursor` из D05, без `offset` и `COUNT(*)` (A06.1);
 *  - дубликаты склеенных страниц отбрасываются по `id`: повторный ответ не рисует строку дважды;
 *  - поиск выполняется только по уже загруженным страницам на клиенте: серверного `q`
 *    в контракте D05 нет, изобретать параметр нельзя;
 *  - фильтр поиска не входит в ключ запроса, поэтому ввод в поле не вызывает сетевых запросов.
 */
import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { listObjects } from './api.js';
import { objectKeys } from './objectKeys.js';
import type { ObjectCursor, ObjectRow } from './types.js';

/** Размер страницы по контракту D05 (≤50); 20 — значение по умолчанию для экрана. */
export const OBJECTS_PAGE_SIZE = 20;

export interface UseObjectsParams {
  /** Подстрока для локального поиска по загруженным страницам. */
  q?: string;
  includeArchived?: boolean;
}

export interface UseObjectsResult {
  items: ObjectRow[];
  /** Сколько строк уже загружено с сервера (для подписи «Показать ещё»). */
  loadedCount: number;
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  refetch: () => Promise<unknown>;
}

function normalize(value: string): string {
  return value.toLocaleLowerCase('ru-RU');
}

/** Склейка страниц без дублей: ключ — `id`, порядок сервера сохраняется. */
function mergePages(pages: ObjectRow[][]): ObjectRow[] {
  const seen = new Set<string>();
  const rows: ObjectRow[] = [];
  for (const page of pages) {
    for (const row of page) {
      if (seen.has(row.id)) {
        continue;
      }
      seen.add(row.id);
      rows.push(row);
    }
  }
  return rows;
}

export function useObjects(params: UseObjectsParams = {}): UseObjectsResult {
  const includeArchived = params.includeArchived ?? false;
  const query = useInfiniteQuery({
    queryKey: objectKeys.list({ includeArchived }),
    queryFn: ({ pageParam }) =>
      listObjects({ cursor: pageParam, includeArchived, limit: OBJECTS_PAGE_SIZE }),
    initialPageParam: null as ObjectCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const loaded = useMemo(
    () => mergePages((query.data?.pages ?? []).map((page) => page.items)),
    [query.data],
  );

  const needle = normalize((params.q ?? '').trim());
  const items = useMemo(() => {
    if (!needle) {
      return loaded;
    }
    return loaded.filter(
      (row) => normalize(row.title).includes(needle) || normalize(row.address).includes(needle),
    );
  }, [loaded, needle]);

  return {
    items,
    loadedCount: loaded.length,
    isLoading: query.isLoading,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}
