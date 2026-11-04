/**
 * Форма создания и правки объекта — одна на оба режима.
 *
 * Инварианты:
 *  - поля ровно `ObjectInput` (название, адрес): служебные ключи в тело не попадают (T12);
 *  - валидация zod выполняется ДО сети: пустое название не отправляется (A06.3);
 *  - кнопка сохранения блокируется на время мутации, повторный Enter не создаёт дубль;
 *  - текст ошибки сервера показывается как есть только потому, что D05 отдаёт безопасные
 *    сообщения без SQL и имён таблиц (INV-007);
 *  - фокус при открытии уходит в первое поле, Tab не выходит за пределы диалога (NFR-10),
 *    Esc закрывает форму, если мутация не выполняется.
 */
import { useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { objectInputSchema } from './schema.js';
import type { ObjectInput, ObjectRow } from './types.js';

export interface ObjectFormProps {
  mode: 'create' | 'edit';
  /** Исходные значения в режиме правки; в режиме создания не передаётся. */
  object?: ObjectRow;
  onCancel: () => void;
  onSubmit: (input: ObjectInput) => Promise<void>;
}

interface FieldErrors {
  title?: string;
  address?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Удержание Tab внутри диалога: без этого фокус уходит на страницу под модалкой. */
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

export function ObjectForm({ mode, object, onCancel, onSubmit }: ObjectFormProps): JSX.Element {
  const titleId = useId();
  const addressId = useId();
  const headingId = useId();
  const errorId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);

  const [title, setTitle] = useState(object?.title ?? '');
  const [address, setAddress] = useState(object?.address ?? '');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) {
      return;
    }

    const parsed = objectInputSchema.safeParse({ title, address });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'title' && !next.title) {
          next.title = issue.message;
        }
        if (field === 'address' && !next.address) {
          next.address = issue.message;
        }
      }
      setFieldErrors(next);
      setServerError(null);
      return;
    }

    setFieldErrors({});
    setServerError(null);
    setBusy(true);
    try {
      await onSubmit(parsed.data);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Не удалось сохранить объект');
      setBusy(false);
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

  const heading = mode === 'create' ? 'Новый объект' : 'Изменить объект';

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-bg-0/80 px-4 py-10">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onKeyDown={handleKeyDown}
        className="w-full max-w-lg rounded-md border border-stroke bg-panel-solid p-6 shadow-glow-violet"
      >
        <h2 id={headingId} className="text-[18px] font-semibold text-text">
          {heading}
        </h2>
        <p className="mt-1 text-sm text-text-dim">
          Название и адрес видны исполнителям в задачах объекта.
        </p>

        <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <div>
            <label htmlFor={titleId} className="block text-sm font-medium text-text">
              Название
            </label>
            <input
              id={titleId}
              name="title"
              type="text"
              maxLength={200}
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-invalid={fieldErrors.title !== undefined}
              aria-describedby={fieldErrors.title ? `${titleId}-error` : undefined}
              className="mt-2 w-full rounded-sm border border-stroke bg-bg-1 px-3 py-2 text-text"
            />
            {fieldErrors.title ? (
              <p id={`${titleId}-error`} className="mt-1 text-sm text-rose">
                {fieldErrors.title}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor={addressId} className="block text-sm font-medium text-text">
              Адрес
            </label>
            <input
              id={addressId}
              name="address"
              type="text"
              maxLength={300}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              aria-invalid={fieldErrors.address !== undefined}
              aria-describedby={fieldErrors.address ? `${addressId}-error` : undefined}
              className="mt-2 w-full rounded-sm border border-stroke bg-bg-1 px-3 py-2 text-text"
            />
            {fieldErrors.address ? (
              <p id={`${addressId}-error`} className="mt-1 text-sm text-rose">
                {fieldErrors.address}
              </p>
            ) : null}
          </div>

          {serverError ? (
            <p id={errorId} role="alert" className="text-sm text-rose">
              {serverError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-sm border border-stroke px-4 py-2 text-sm text-text-dim transition hover:border-stroke-strong hover:text-text disabled:opacity-40"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-sm bg-cyan px-4 py-2 text-sm font-semibold text-bg-0 transition hover:shadow-glow-cyan disabled:opacity-40"
            >
              Сохранить
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
