/**
 * Карточки менеджеров команды на /team: KPI исполнителей с реплики (DEC-068).
 *
 * В продуктовом языке заказчика «менеджеры» = Анна/Пётр (role executor), а не
 * постановщик и не учётки role=manager. Данные — `/api/reports/workload`.
 *
 * Инварианты:
 *  - агрегаты без email (INV-011);
 *  - постановщик в сетке не появляется;
 *  - деградация реплики локальна, форма создания менеджера остаётся доступной.
 */
import { useQuery } from '@tanstack/react-query';
import {
  getReportApi,
  ReplicaUnavailable,
  type WorkloadRow,
} from '../reports/api.js';
import { STATUS_LABELS } from '../tasks/HistoryList.js';
import type { TaskStatus } from '../tasks/types.js';

const STATUS_ORDER: readonly TaskStatus[] = [
  'new',
  'in_progress',
  'on_review',
  'rework',
  'accepted',
];

function statusCount(row: WorkloadRow, status: TaskStatus): number {
  switch (status) {
    case 'new':
      return row.tasks_new;
    case 'in_progress':
      return row.tasks_in_progress;
    case 'on_review':
      return row.tasks_on_review;
    case 'rework':
      return row.tasks_rework;
    case 'accepted':
      return row.tasks_accepted;
  }
}

export function ManagerCards(): JSX.Element {
  const query = useQuery({
    queryKey: ['reports', 'workload', 'team-cards'],
    queryFn: async (): Promise<WorkloadRow[]> => {
      const envelope = await getReportApi().getReport('workload');
      return envelope.data as WorkloadRow[];
    },
  });

  if (query.isLoading) {
    return (
      <p role="status" className="mt-8 text-sm text-text-dim">
        Загрузка статистики менеджеров…
      </p>
    );
  }

  if (query.isError) {
    const message =
      query.error instanceof ReplicaUnavailable
        ? 'Статистика временно недоступна (реплика). Форму создания можно использовать.'
        : query.error instanceof Error
          ? query.error.message
          : 'Не удалось загрузить статистику';
    return (
      <p role="alert" className="mt-8 text-sm text-rose">
        {message}
      </p>
    );
  }

  const rows = query.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="mt-8 text-sm text-text-mute">Пока нет менеджеров с задачами.</p>
    );
  }

  return (
    <section aria-labelledby="managers-cards-title" className="mt-8">
      <h2 id="managers-cards-title" className="text-lg font-semibold text-text">
        Менеджеры
      </h2>
      <p className="mt-1 text-sm text-text-dim">
        Назначенные задачи по статусам. KPI — доля принятых среди активных задач.
      </p>
      <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const acceptedShare =
            row.tasks_total === 0
              ? 0
              : Math.round((1000 * row.tasks_accepted) / row.tasks_total) / 10;
          return (
            <li
              key={row.assignee_id}
              className="rounded-md border border-stroke bg-panel p-4"
              aria-label={`Менеджер ${row.full_name}`}
            >
              <h3 className="text-base font-semibold text-text">{row.full_name}</h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-text-mute">
                    Всего задач
                  </dt>
                  <dd className="mt-0.5 font-mono text-text">{row.tasks_total}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-text-mute">
                    KPI · доля принятых
                  </dt>
                  <dd className="mt-0.5 font-mono text-lime">{acceptedShare}%</dd>
                </div>
              </dl>
              <ul className="mt-3 space-y-1 border-t border-stroke pt-3 text-xs text-text-dim">
                {STATUS_ORDER.map((status) => (
                  <li key={status} className="flex justify-between gap-2">
                    <span>{STATUS_LABELS[status]}</span>
                    <span className="font-mono text-text">{statusCount(row, status)}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
