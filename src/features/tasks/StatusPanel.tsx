/**
 * Панель переходов статуса.
 *
 * Инварианты:
 *  - набор кнопок — ровно `allowedTargets(status, role)` из D07; это подсказка, а не защита:
 *    решение принимает `rpc.change_task_status` (INV-003, T14);
 *  - возврат на доработку требует непустой комментарий; пустой ввод не уходит на сервер (A08.3);
 *  - статус на экране меняется только после успешного ответа RPC: оптимистичных обновлений нет
 *    (A08.5), поэтому при ошибке карточка и история остаются прежними;
 *  - после успеха инвалидируются карточка, история, «мои задачи» и списки задач;
 *  - во время мутации все кнопки disabled: повторный клик не создаёт второй переход;
 *  - `accepted` терминален (DEC-058): кнопки скрыты сразу по ответу RPC, видна фиксация.
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { changeTaskStatus } from './mutations.js';
import { allowedTargets, requiresComment } from './transitions.js';
import { taskKeys } from './useTask.js';
import type { TaskStatus, UserRole } from './types.js';

const TRANSITION_LABELS: Record<string, string> = {
  'new->in_progress': 'Взять в работу',
  'rework->in_progress': 'Взять в работу',
  'in_progress->on_review': 'На проверку',
  'on_review->accepted': 'Принять',
  'on_review->rework': 'На доработку',
};

function transitionLabel(from: TaskStatus, to: TaskStatus): string {
  return TRANSITION_LABELS[`${from}->${to}`] ?? `Перевести в «${to}»`;
}

export interface StatusPanelProps {
  taskId: string;
  status: TaskStatus;
  role: UserRole;
}

export function StatusPanel({ taskId, status, role }: StatusPanelProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const [reworkOpen, setReworkOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: { target: TaskStatus; comment?: string }) =>
      changeTaskStatus(taskId, payload.target, payload.comment),
    onSuccess: async (newStatus) => {
      setReworkOpen(false);
      setComment('');
      setCommentError(null);
      // Сразу фиксируем статус в кэше карточки — бейдж и панель не ждут refetch (DEC-058).
      queryClient.setQueryData(taskKeys.detail(taskId), (current: unknown) => {
        if (!current || typeof current !== 'object') {
          return current;
        }
        return { ...current, status: newStatus };
      });
      // Точечная инвалидация: карточка, история и списки, без очистки всего кэша.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) }),
        queryClient.invalidateQueries({ queryKey: taskKeys.history(taskId) }),
        queryClient.invalidateQueries({ queryKey: taskKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['my-tasks'] }),
      ]);
    },
  });

  // После успешного RPC сразу берём статус из ответа — кнопки «Принять» не ждут refetch (DEC-058).
  const effectiveStatus: TaskStatus = mutation.data ?? status;
  const targets = allowedTargets(effectiveStatus, role);

  if (effectiveStatus === 'accepted') {
    return (
      <section aria-labelledby="status-panel-title" className="mt-6">
        <h2 id="status-panel-title" className="sr-only">
          Действия со статусом
        </h2>
        <p role="status" className="text-sm text-text-dim">
          Статус зафиксирован. Дальнейшая смена недоступна.
        </p>
      </section>
    );
  }

  if (targets.length === 0) {
    return null;
  }

  function submitRework(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const text = comment.trim();
    if (text.length === 0) {
      setCommentError('Опишите, что доработать');
      return;
    }
    setCommentError(null);
    mutation.mutate({ target: 'rework', comment: text });
  }

  return (
    <section aria-labelledby="status-panel-title" className="mt-6">
      <h2 id="status-panel-title" className="sr-only">
        Действия со статусом
      </h2>

      <div className="flex flex-wrap items-center gap-2">
        {targets.map((target) => (
          <button
            key={target}
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              if (requiresComment(status, target)) {
                setReworkOpen(true);
                return;
              }
              mutation.mutate({ target });
            }}
            className={
              target === 'accepted'
                ? 'rounded-sm bg-lime px-4 py-2 text-sm font-semibold text-bg-0 transition hover:shadow-glow-cyan disabled:opacity-40'
                : target === 'rework'
                  ? 'rounded-sm border border-amber/60 px-4 py-2 text-sm text-amber transition hover:border-amber disabled:opacity-40'
                  : 'rounded-sm bg-cyan px-4 py-2 text-sm font-semibold text-bg-0 transition hover:shadow-glow-cyan disabled:opacity-40'
            }
          >
            {transitionLabel(status, target)}
          </button>
        ))}
      </div>

      {reworkOpen ? (
        <form
          className="mt-3 rounded-sm border border-stroke bg-bg-1 p-4"
          onSubmit={submitRework}
          noValidate
        >
          <label htmlFor="rework-comment" className="block text-sm font-medium text-text">
            Что доработать
          </label>
          <textarea
            id="rework-comment"
            name="comment"
            rows={3}
            maxLength={2000}
            autoFocus
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            aria-invalid={commentError !== null}
            aria-describedby={commentError ? 'rework-comment-error' : undefined}
            className="mt-2 w-full rounded-sm border border-stroke bg-bg-1 px-3 py-2 text-sm text-text"
          />
          {commentError ? (
            <p id="rework-comment-error" className="mt-1 text-sm text-rose">
              {commentError}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-sm bg-amber px-4 py-2 text-sm font-semibold text-bg-0 transition disabled:opacity-40"
            >
              Отправить
            </button>
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => {
                setReworkOpen(false);
                setComment('');
                setCommentError(null);
              }}
              className="rounded-sm border border-stroke px-4 py-2 text-sm text-text-dim transition hover:border-stroke-strong hover:text-text disabled:opacity-40"
            >
              Отмена
            </button>
          </div>
        </form>
      ) : null}

      {mutation.isError ? (
        <p role="alert" className="mt-3 text-sm text-rose">
          {mutation.error instanceof Error
            ? mutation.error.message
            : 'Не удалось изменить статус задачи'}
        </p>
      ) : null}
    </section>
  );
}
