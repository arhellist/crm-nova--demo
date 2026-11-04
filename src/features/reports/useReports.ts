/**
 * Запросы экрана отчётов: три независимых `useQuery` с одним окном свежести.
 *
 * Инварианты:
 *  - `staleTime` 30 с совпадает с кэшем backend: клиент не запрашивает чаще, чем
 *    данные могут измениться (NFR4, INVARIANTS 5);
 *  - `retry: 1` — одна повторная попытка на сетевой сбой, без шторма запросов (NFR13);
 *  - 503 (`ReplicaUnavailable`) не выбрасывается в дерево: отчёт переходит в состояние
 *    `degraded`, остальные экраны продолжают работать (A12.4);
 *  - отчёты независимы: падение одного не скрывает данные двух других;
 *  - данные не пишутся в `localStorage` и не покидают память вкладки (INVARIANTS 7).
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type {
  ObjectReportRow,
  ReportEnvelope,
  ReportPath,
  StatusAgeRow,
  WorkloadRow,
} from './api.js';
import { getReportApi, ReplicaUnavailable, ReportRequestError } from './api.js';

/** Окно свежести: ровно TTL кэша backend (30 с). */
export const REPORT_STALE_TIME_MS = 30_000;

export type ReportState = 'loading' | 'ready' | 'degraded' | 'error';

export interface ReportQuery<T> {
  state: ReportState;
  data: T[];
  source: 'replica' | null;
  lagSeconds: number | null;
  generatedAt: string | null;
  message: string | null;
  refetch: () => void;
}

export interface ReportsQueries {
  objects: ReportQuery<ObjectReportRow>;
  workload: ReportQuery<WorkloadRow>;
  statusAges: ReportQuery<StatusAgeRow>;
  /** Хотя бы один отчёт недоступен: показываем верхнюю плашку деградации. */
  degraded: boolean;
  /** Лаг самого свежего ответа; при деградации сохраняется последнее известное значение. */
  lagSeconds: number | null;
  refetchAll: () => void;
}

function describeError(error: unknown): { state: ReportState; message: string | null } {
  if (error instanceof ReplicaUnavailable) {
    return { state: 'degraded', message: error.message };
  }
  if (error instanceof ReportRequestError) {
    return { state: 'error', message: error.message };
  }
  return { state: 'error', message: 'Не удалось загрузить отчёт' };
}

function toReportQuery<T>(
  query: UseQueryResult<ReportEnvelope<unknown>, Error>,
): ReportQuery<T> {
  const refetch = (): void => {
    void query.refetch();
  };
  if (query.isLoading) {
    return {
      state: 'loading',
      data: [],
      source: null,
      lagSeconds: null,
      generatedAt: null,
      message: null,
      refetch,
    };
  }
  if (query.isError) {
    const described = describeError(query.error);
    return {
      state: described.state,
      data: [],
      source: null,
      lagSeconds: null,
      generatedAt: null,
      message: described.message,
      refetch,
    };
  }
  if (!query.data) {
    return {
      state: 'loading',
      data: [],
      source: null,
      lagSeconds: null,
      generatedAt: null,
      message: null,
      refetch,
    };
  }
  return {
    state: 'ready',
    data: query.data.data as T[],
    source: query.data.source,
    lagSeconds: query.data.lag_seconds,
    generatedAt: query.data.generated_at,
    message: null,
    refetch,
  };
}

function useReport<T>(path: ReportPath): ReportQuery<T> {
  const query = useQuery({
    queryKey: ['reports', path],
    queryFn: () => getReportApi().getReport(path),
    staleTime: REPORT_STALE_TIME_MS,
    retry: 1,
  });
  return toReportQuery<T>(query);
}

export function useReports(): ReportsQueries {
  const objects = useReport<ObjectReportRow>('objects');
  const workload = useReport<WorkloadRow>('workload');
  const statusAges = useReport<StatusAgeRow>('status-ages');

  const all = [objects, workload, statusAges];
  const lagSeconds = all.reduce<number | null>(
    (max, report) =>
      report.lagSeconds === null ? max : max === null ? report.lagSeconds : Math.max(max, report.lagSeconds),
    null,
  );

  return {
    objects,
    workload,
    statusAges,
    degraded: all.some((report) => report.state === 'degraded'),
    lagSeconds,
    refetchAll: () => {
      for (const report of all) report.refetch();
    },
  };
}
