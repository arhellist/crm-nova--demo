/**
 * История переходов задачи и бейдж статуса.
 *
 * Инварианты:
 *  - порядок задаёт сервер (`created_at.desc,id.desc`): первая строка — последний переход,
 *    последняя — создание; клиент не пересортировывает (A08.6);
 *  - статус всегда подписан текстом, цвет — вспомогательный признак (NFR-10, design-notes);
 *  - комментарий показывается только у строки возврата на доработку и не редактируется (INV-004);
 *  - имя актора берётся из `profiles`; если профиль не загрузился, показывается нейтральная подпись.
 */
import type { TaskHistoryRow } from './useTask.js';
import type { TaskStatus } from './types.js';

export const STATUS_LABELS: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  on_review: 'На проверке',
  rework: 'На доработке',
  accepted: 'Принята',
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  new: 'border-magenta/60 text-magenta',
  in_progress: 'border-cyan/60 text-cyan',
  on_review: 'border-violet/60 text-violet',
  rework: 'border-amber/60 text-amber',
  accepted: 'border-lime/60 text-lime',
};

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
});

/** Дата-время в Europe/Moscow по §8 `domain-rules.md`; некорректное значение — прочерк. */
export function formatMoscowDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
}

/** Бейдж статуса: цвет + подпись, не только цвет. */
export function StatusBadge({ status }: { status: TaskStatus }): JSX.Element {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Подпись события истории: что именно произошло с задачей. */
function eventTitle(row: TaskHistoryRow): string {
  if (row.from_status === null) {
    return 'Создана';
  }
  switch (row.to_status) {
    case 'in_progress':
      return 'В работу';
    case 'on_review':
      return 'На проверку';
    case 'accepted':
      return 'Принята';
    case 'rework':
      return 'На доработку';
    default:
      return STATUS_LABELS[row.to_status];
  }
}

export interface HistoryListProps {
  rows: TaskHistoryRow[];
  people: Record<string, string>;
  isLoading?: boolean;
  isError?: boolean;
}

/** Вертикальный таймлайн истории: новые сверху, первая запись — создание задачи. */
export function HistoryList({ rows, people, isLoading, isError }: HistoryListProps): JSX.Element {
  return (
    <section aria-labelledby="history-title" className="mt-8">
      <h2 id="history-title" className="text-[18px] font-semibold text-text">
        История
      </h2>

      {isLoading ? (
        <p role="status" className="mt-3 text-sm text-text-dim">
          Загрузка истории…
        </p>
      ) : null}

      {isError ? (
        <p role="alert" className="mt-3 text-sm text-rose">
          Не удалось загрузить историю.
        </p>
      ) : null}

      {!isLoading && !isError && rows.length === 0 ? (
        <p className="mt-3 text-sm text-text-mute">Событий пока нет.</p>
      ) : null}

      {rows.length > 0 ? (
        <ol aria-label="История переходов" className="mt-3 space-y-3 border-l border-stroke pl-4">
          {rows.map((row) => (
            <li key={`${row.id}-${row.created_at}`} className="relative">
              <span
                aria-hidden="true"
                className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-stroke-strong"
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-text">{eventTitle(row)}</span>
                <StatusBadge status={row.to_status} />
                <span className="text-xs text-text-mute">
                  {formatMoscowDateTime(row.created_at)}
                </span>
              </div>
              <p className="mt-1 text-xs text-text-dim">
                {people[row.changed_by] ?? 'Участник'}
              </p>
              {row.comment ? (
                <p className="mt-1 rounded-sm border border-stroke bg-bg-1 px-3 py-2 text-sm text-text-dim">
                  {row.comment}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
