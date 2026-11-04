/**
 * Подтверждение архивирования объекта.
 *
 * Инварианты:
 *  - удаления в продукте нет: диалог только архивирует, текст говорит об истории (A06.4);
 *  - RPC вызывается ровно один раз: синхронный `inFlight`-флаг переживает двойной клик
 *    и повторный Enter до перерисовки, кнопки дополнительно блокируются;
 *  - фокус при открытии — на «Отмена» (безопасное действие), Tab удерживается в диалоге,
 *    Esc закрывает его, пока запрос не ушёл (NFR-10);
 *  - ошибка RPC показывается безопасным текстом D05, без SQL (INV-007).
 */
import { useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { ObjectRow } from './types.js';

export interface ObjectArchiveDialogProps {
  object: Pick<ObjectRow, 'title'>;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapTab(event: KeyboardEvent<HTMLElement>, container: HTMLElement | null): void {
  if (event.key !== 'Tab' || container === null) {
    return;
  }
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  const first = nodes.at(0);
  const last = nodes.at(-1);
  if (!first || !last) {
    return;
  }
  const active = document.activeElement;
  const inside = active !== null && container.contains(active);
  if (event.shiftKey && (!inside || active === first)) {
    event.preventDefault();
    last.focus();
    return;
  }
  if (!event.shiftKey && (!inside || active === last)) {
    event.preventDefault();
    first.focus();
  }
}

export function ObjectArchiveDialog({
  object,
  onCancel,
  onConfirm,
}: ObjectArchiveDialogProps): JSX.Element {
  const headingId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm(): Promise<void> {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      // Диалог закрывает родитель; до размонтирования повторный вызов запрещён.
    } catch (confirmError) {
      inFlight.current = false;
      setBusy(false);
      setError(
        confirmError instanceof Error ? confirmError.message : 'Не удалось переместить объект в архив',
      );
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape' && !busy) {
      event.stopPropagation();
      onCancel();
      return;
    }
    trapTab(event, dialogRef.current);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-bg-0/80 px-4">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-md border border-rose/60 bg-panel-solid p-6 shadow-glow-violet"
      >
        <h2 id={headingId} className="text-[18px] font-semibold text-text">
          Архивировать объект?
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-text-dim">
          «{object.title}» будет помечен как архивный. Объект и его задачи останутся в истории.
        </p>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-rose">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            disabled={busy}
            className="rounded-sm border border-stroke px-4 py-2 text-sm text-text-dim transition hover:border-stroke-strong hover:text-text disabled:opacity-40"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy}
            className="rounded-sm bg-rose px-4 py-2 text-sm font-semibold text-bg-0 transition hover:shadow-glow-violet disabled:opacity-40"
          >
            Архивировать
          </button>
        </div>
      </section>
    </div>
  );
}
