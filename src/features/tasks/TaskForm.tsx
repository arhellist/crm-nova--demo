/**
 * Форма создания и правки задачи.
 *
 * Инварианты:
 *  - `status`, `author_id` и `archived_at` не отправляются: их ставит БД (T14);
 *  - объект при создании фиксирован карточкой объекта; в правке берётся из `TaskRow`;
 *  - исполнитель выбирается только из `profiles` с ролью `executor`; смена исполнителя
 *    доступна лишь в `new`/`rework` — триггер БД проверяет это повторно (DEC-017);
 *  - валидация Zod до сети: пустое название и невалидный uuid не уходят на сервер;
 *  - кнопка блокируется на время мутации, Esc закрывает форму только без активного запроса.
 */
import { useId, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTask, updateTask } from './api.js';
import { taskInputSchema } from './schema.js';
import { taskKeys, useExecutors } from './useTask.js';
import type { TaskInput, TaskRow } from './types.js';

export interface TaskFormProps {
  mode: 'create' | 'edit';
  /** Обязателен в режиме создания: задача рождается в карточке объекта. */
  objectId?: string;
  task?: TaskRow;
  onCancel: () => void;
  onSaved: (row: TaskRow) => void | Promise<void>;
}

interface FieldErrors {
  title?: string;
  description?: string;
  assignee_id?: string;
}

export function TaskForm({ mode, objectId, task, onCancel, onSaved }: TaskFormProps): JSX.Element {
  const titleId = useId();
  const descriptionId = useId();
  const assigneeId = useId();
  const headingId = useId();

  const queryClient = useQueryClient();
  const executors = useExecutors();

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [assignee, setAssignee] = useState(task?.assignee_id ?? '');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const fixedObjectId = task?.object_id ?? objectId ?? '';
  const assigneeLocked =
    mode === 'edit' && task !== undefined && task.status !== 'new' && task.status !== 'rework';

  const mutation = useMutation({
    mutationFn: (input: TaskInput) =>
      mode === 'edit' && task ? updateTask(task.id, input) : createTask(input),
    onSuccess: async (row) => {
      if (task) {
        await queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) });
      }
      await queryClient.invalidateQueries({ queryKey: taskKeys.all });
      await queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      await onSaved(row);
    },
    onError: (error) => {
      setServerError(error instanceof Error ? error.message : 'Не удалось сохранить задачу');
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (mutation.isPending) {
      return;
    }

    const parsed = taskInputSchema.safeParse({
      object_id: fixedObjectId,
      title,
      description,
      assignee_id: assignee,
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'title' && !next.title) {
          next.title = issue.message;
        }
        if (field === 'description' && !next.description) {
          next.description = issue.message;
        }
        if (field === 'assignee_id' && !next.assignee_id) {
          next.assignee_id = issue.message;
        }
      }
      setFieldErrors(next);
      setServerError(null);
      return;
    }

    setFieldErrors({});
    setServerError(null);
    mutation.mutate(parsed.data);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape' && !mutation.isPending) {
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-bg-0/80 px-4 py-10">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onKeyDown={handleKeyDown}
        className="w-full max-w-lg rounded-md border border-stroke bg-panel-solid p-6 shadow-glow-violet"
      >
        <h2 id={headingId} className="text-[18px] font-semibold text-text">
          {mode === 'create' ? 'Новая задача' : 'Изменить задачу'}
        </h2>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
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
            <label htmlFor={descriptionId} className="block text-sm font-medium text-text">
              Описание
            </label>
            <textarea
              id={descriptionId}
              name="description"
              rows={4}
              maxLength={5000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              aria-invalid={fieldErrors.description !== undefined}
              aria-describedby={fieldErrors.description ? `${descriptionId}-error` : undefined}
              className="mt-2 w-full rounded-sm border border-stroke bg-bg-1 px-3 py-2 text-sm text-text"
            />
            {fieldErrors.description ? (
              <p id={`${descriptionId}-error`} className="mt-1 text-sm text-rose">
                {fieldErrors.description}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor={assigneeId} className="block text-sm font-medium text-text">
              Исполнитель
            </label>
            <select
              id={assigneeId}
              name="assignee_id"
              value={assignee}
              disabled={assigneeLocked}
              onChange={(event) => setAssignee(event.target.value)}
              aria-invalid={fieldErrors.assignee_id !== undefined}
              aria-describedby={fieldErrors.assignee_id ? `${assigneeId}-error` : undefined}
              className="mt-2 w-full rounded-sm border border-stroke bg-bg-1 px-3 py-2 text-text disabled:opacity-60"
            >
              <option value="">Выберите исполнителя</option>
              {executors.items.map((executor) => (
                <option key={executor.id} value={executor.id}>
                  {executor.full_name}
                </option>
              ))}
            </select>
            {assigneeLocked ? (
              <p className="mt-1 text-xs text-text-mute">
                Исполнителя можно менять только в статусах «Новая» и «На доработке».
              </p>
            ) : null}
            {fieldErrors.assignee_id ? (
              <p id={`${assigneeId}-error`} className="mt-1 text-sm text-rose">
                {fieldErrors.assignee_id}
              </p>
            ) : null}
          </div>

          {serverError ? (
            <p role="alert" className="text-sm text-rose">
              {serverError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={mutation.isPending}
              className="rounded-sm border border-stroke px-4 py-2 text-sm text-text-dim transition hover:border-stroke-strong hover:text-text disabled:opacity-40"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
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
