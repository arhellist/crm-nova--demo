/**
 * Бейдж актуальности отчёта: источник данных и лаг репликации всегда видны рядом с числами.
 *
 * Инварианты:
 *  - источник подписан словом «реплика», а не только цветом (design-notes, WCAG AA);
 *  - при `lag_seconds > 30` бейдж становится предупреждающим (янтарный), но данные
 *    продолжают показываться: устаревшие агрегаты честнее пустого экрана (A12.3);
 *  - при деградации текст «Отчёты временно недоступны» и никаких выдуманных чисел (A12.4);
 *  - лаг округляется до целого: подпись «лаг 2 с» читается лучше, чем «2.417 с».
 */
export interface FreshnessBadgeProps {
  source: 'replica' | null;
  lagSeconds: number | null;
  degraded: boolean;
}

/** Порог предупреждения совпадает с backend `REPLICA_LAG_ALERT_SECONDS`. */
export const LAG_WARNING_SECONDS = 30;

export function FreshnessBadge({ source, lagSeconds, degraded }: FreshnessBadgeProps): JSX.Element {
  if (degraded) {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-2 rounded-sm border border-rose/40 bg-rose/10 px-3 py-1.5 text-xs text-rose"
      >
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-rose" />
        Отчёты временно недоступны
      </span>
    );
  }

  const lag = lagSeconds === null ? null : Math.round(lagSeconds);
  const stale = lag !== null && lag > LAG_WARNING_SECONDS;
  const tone = stale
    ? 'border-amber/40 bg-amber/10 text-amber'
    : 'border-stroke bg-panel text-text-dim';

  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 rounded-sm border px-3 py-1.5 text-xs ${tone}`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${stale ? 'bg-amber' : 'bg-lime'}`}
      />
      {source === 'replica' ? 'Данные на реплике' : 'Источник данных неизвестен'}
      {lag === null ? '' : ` · лаг ${lag} с`}
      {stale ? ' · данные устарели' : ''}
    </span>
  );
}
