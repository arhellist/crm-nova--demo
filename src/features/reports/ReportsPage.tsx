/**
 * Экран отчётов `/reports`: три вкладки, актуальность и локальная деградация.
 *
 * Инварианты:
 *  - доступ решает маршрут (`RequireManager`), компонент не проверяет роль повторно;
 *  - данные не считаются на клиенте: таблицы рендерят готовые агрегаты реплики (INV-011);
 *  - `source` и `lag_seconds` видны рядом с данными на каждой вкладке (A12.1, A12.3);
 *  - 503 не прячет навигацию: панель деградации живёт внутри экрана и предлагает «Повторить»
 *    (A12.4), а пункты меню остаются доступны;
 *  - в разметку попадают только поля контракта: email, описаний и комментариев здесь нет (A12.5);
 *  - таблицы адаптивны: горизонтальная прокрутка на 360 px, без потери колонок.
 */
import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { FreshnessBadge } from './FreshnessBadge.js';
import { useReports } from './useReports.js';
import type { ObjectReportRow, StatusAgeRow, WorkloadRow } from './api.js';
import type { ReportQuery, ReportState } from './useReports.js';

type ReportTab = 'objects' | 'workload' | 'status-ages';

const TABS: ReadonlyArray<{ value: ReportTab; label: string }> = [
  { value: 'objects', label: 'Объекты' },
  { value: 'workload', label: 'Загрузка' },
  { value: 'status-ages', label: 'Возраст статусов' },
];

/** Секунды в человекочитаемый срок: отчёты не показывают сырые числа без единиц. */
function formatDuration(seconds: number): string {
  const total = Math.max(Math.round(seconds), 0);
  if (total < 60) return `${total} с`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes === 0 ? `${hours} ч` : `${hours} ч ${restMinutes} мин`;
}

function formatDate(value: string | null): string {
  if (value === null) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    date,
  );
}

/** Скелетон строк: показывает структуру таблицы, пока данные не пришли. */
function SkeletonRows({ columns }: { columns: number }): JSX.Element {
  return (
    <tbody aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <tr key={row} className="border-t border-stroke/60">
          {Array.from({ length: columns }, (_, column) => (
            <td key={column} className="px-3 py-3">
              <span className="block h-4 w-full animate-pulse rounded-sm bg-bg-2" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

function Panel({
  state,
  message,
  onRetry,
}: {
  state: ReportState;
  message: string | null;
  onRetry: () => void;
}): JSX.Element | null {
  if (state === 'degraded' || state === 'error') {
    return (
      <div
        role="alert"
        className="mt-4 rounded-md border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-text"
      >
        <p className="font-semibold">
          {state === 'degraded' ? 'Отчёты временно недоступны' : 'Не удалось загрузить отчёт'}
        </p>
        <p className="mt-1 text-text-dim">
          {message ?? 'Повторите запрос позже. Остальные разделы продукта продолжают работать.'}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-sm border border-stroke px-3 py-1.5 text-sm text-text transition hover:border-cyan hover:text-cyan"
        >
          Повторить
        </button>
      </div>
    );
  }
  return null;
}

function EmptyRow({ columns }: { columns: number }): JSX.Element {
  return (
    <tbody>
      <tr>
        <td colSpan={columns} className="px-3 py-6 text-center text-sm text-text-dim">
          Данных за период нет
        </td>
      </tr>
    </tbody>
  );
}

function ObjectsTable({ report }: { report: ReportQuery<ObjectReportRow> }): JSX.Element {
  const columns = 7;
  return (
    <table className="w-full min-w-[720px] border-collapse text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-text-mute">
          <th scope="col" className="px-3 py-2">Объект</th>
          <th scope="col" className="px-3 py-2">Всего</th>
          <th scope="col" className="px-3 py-2">В работе</th>
          <th scope="col" className="px-3 py-2">На проверке</th>
          <th scope="col" className="px-3 py-2">На доработке</th>
          <th scope="col" className="px-3 py-2">Принято</th>
          <th scope="col" className="px-3 py-2">Доля принятых</th>
        </tr>
      </thead>
      {report.state === 'loading' ? (
        <SkeletonRows columns={columns} />
      ) : report.data.length === 0 ? (
        <EmptyRow columns={columns} />
      ) : (
        <tbody>
          {report.data.map((row) => (
            <tr key={row.object_id} className="border-t border-stroke/60">
              <th scope="row" className="px-3 py-3 text-left font-medium text-text">
                {row.title}
                <span className="mt-0.5 block text-xs font-normal text-text-mute">{row.address}</span>
              </th>
              <td className="px-3 py-3 text-text-dim">{row.tasks_total}</td>
              <td className="px-3 py-3 text-text-dim">{row.tasks_in_progress}</td>
              <td className="px-3 py-3 text-text-dim">{row.tasks_on_review}</td>
              <td className="px-3 py-3 text-text-dim">{row.tasks_rework}</td>
              <td className="px-3 py-3 text-text-dim">{row.tasks_accepted}</td>
              <td className="px-3 py-3 text-text-dim">{row.accepted_share.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      )}
    </table>
  );
}

function WorkloadTable({ report }: { report: ReportQuery<WorkloadRow> }): JSX.Element {
  const columns = 6;
  return (
    <table className="w-full min-w-[640px] border-collapse text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-text-mute">
          <th scope="col" className="px-3 py-2">Исполнитель</th>
          <th scope="col" className="px-3 py-2">Всего</th>
          <th scope="col" className="px-3 py-2">В работе</th>
          <th scope="col" className="px-3 py-2">На проверке</th>
          <th scope="col" className="px-3 py-2">На доработке</th>
          <th scope="col" className="px-3 py-2">Принято</th>
        </tr>
      </thead>
      {report.state === 'loading' ? (
        <SkeletonRows columns={columns} />
      ) : report.data.length === 0 ? (
        <EmptyRow columns={columns} />
      ) : (
        <tbody>
          {report.data.map((row) => (
            <tr key={row.assignee_id} className="border-t border-stroke/60">
              <th scope="row" className="px-3 py-3 text-left font-medium text-text">
                {row.full_name}
              </th>
              <td className="px-3 py-3 text-text-dim">{row.tasks_total}</td>
              <td className="px-3 py-3 text-text-dim">{row.tasks_in_progress}</td>
              <td className="px-3 py-3 text-text-dim">{row.tasks_on_review}</td>
              <td className="px-3 py-3 text-text-dim">{row.tasks_rework}</td>
              <td className="px-3 py-3 text-text-dim">{row.tasks_accepted}</td>
            </tr>
          ))}
        </tbody>
      )}
    </table>
  );
}

function StatusAgesTable({ report }: { report: ReportQuery<StatusAgeRow> }): JSX.Element {
  const columns = 3;
  return (
    <table className="w-full min-w-[480px] border-collapse text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-text-mute">
          <th scope="col" className="px-3 py-2">День</th>
          <th scope="col" className="px-3 py-2">Среднее время на проверке</th>
          <th scope="col" className="px-3 py-2">Максимум</th>
        </tr>
      </thead>
      {report.state === 'loading' ? (
        <SkeletonRows columns={columns} />
      ) : report.data.length === 0 ? (
        <EmptyRow columns={columns} />
      ) : (
        <tbody>
          {report.data.map((row) => (
            <tr key={row.day} className="border-t border-stroke/60">
              <th scope="row" className="px-3 py-3 text-left font-medium text-text">
                {formatDate(row.day)}
              </th>
              <td className="px-3 py-3 text-text-dim">{formatDuration(row.avg_seconds_in_status)}</td>
              <td className="px-3 py-3 text-text-dim">{formatDuration(row.max_seconds_in_status)}</td>
            </tr>
          ))}
        </tbody>
      )}
    </table>
  );
}

export function ReportsPage(): JSX.Element {
  const [tab, setTab] = useState<ReportTab>('objects');
  const reports = useReports();
  const active = useMemo<ReportQuery<ObjectReportRow> | ReportQuery<WorkloadRow> | ReportQuery<StatusAgeRow>>(() => {
    if (tab === 'workload') return reports.workload;
    if (tab === 'status-ages') return reports.statusAges;
    return reports.objects;
  }, [tab, reports]);

  const lagSeconds = active.lagSeconds ?? reports.lagSeconds;
  const degraded = active.state === 'degraded';

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const keys: Record<string, number> = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    const nextIndex = keys[event.key];
    if (nextIndex === undefined) return;
    event.preventDefault();
    const next = TABS[nextIndex];
    if (!next) return;
    setTab(next.value);
    document.getElementById(`reports-tab-${next.value}`)?.focus();
  }

  return (
    <section className="p-6" aria-labelledby="reports-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="reports-title" className="text-[28px] font-semibold tracking-tight text-text">
            Отчёты
          </h1>
          <p className="mt-1 text-sm text-text-dim">
            Агрегаты формируются на вторичной реплике и не влияют на работу с задачами.
          </p>
        </div>
        <FreshnessBadge source={active.source} lagSeconds={lagSeconds} degraded={degraded} />
      </div>

      <div
        role="tablist"
        aria-label="Отчёты"
        className="mt-5 flex flex-wrap gap-1 border-b border-stroke"
      >
        {TABS.map((item, index) => {
          const selected = item.value === tab;
          return (
            <button
              key={item.value}
              id={`reports-tab-${item.value}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`reports-panel-${item.value}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(item.value)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              className={[
                'rounded-t-sm px-3 py-2 text-sm transition',
                selected
                  ? 'border-b-2 border-cyan text-text'
                  : 'border-b-2 border-transparent text-text-dim hover:text-text',
              ].join(' ')}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        id={`reports-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`reports-tab-${tab}`}
        className="mt-4"
      >
        <div className="overflow-x-auto rounded-md border border-stroke bg-panel">
          {tab === 'objects' ? <ObjectsTable report={reports.objects} /> : null}
          {tab === 'workload' ? <WorkloadTable report={reports.workload} /> : null}
          {tab === 'status-ages' ? <StatusAgesTable report={reports.statusAges} /> : null}
        </div>

        <Panel state={active.state} message={active.message} onRetry={reports.refetchAll} />
      </div>
    </section>
  );
}
