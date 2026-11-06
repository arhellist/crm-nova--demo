/**
 * Строка списка «Мои задачи»: полный набор полей ТЗ и основное действие.
 *
 * Инварианты:
 *  - в строке видны название, описание, объект, исполнитель, статус, автор, дата создания
 *    (hh §2.3 / DEC-057); пустое описание — явная заглушка, не скрытие;
 *  - набор действий — ровно `allowedTargets(status, role)`; это подсказка, а не защита:
 *    решение принимает `rpc.change_task_status` (INV-003);
 *  - обычный переход выполняется тем же RPC, что и в карточке, и только после успешного
 *    ответа строка меняет статус: оптимистичных обновлений нет (A09.3);
 *  - «На доработку» требует комментарий, поэтому ведёт в карточку задачи: строка не
 *    собирает текст и не отправляет пустой комментарий (DEC-022);
 *  - после успеха инвалидируются `['my-tasks']` (вкладки и счётчики), `['task']` и `['tasks']`,
 *    поэтому строка переезжает в свою вкладку без дублей;
 *  - ошибка перехода показывается в строке и не меняет статус;
 *  - после принятия (`accepted`) действия заморожены: подпись фиксации, без кнопок (DEC-058).
 */
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { StatusBadge, formatMoscowDateTime } from './HistoryList.js';
import { changeTaskStatus } from './mutations.js';
import { allowedTargets, requiresComment } from './transitions.js';
import type { TaskRow as TaskRowModel, TaskStatus, UserRole } from './types.js';

/**
 * Подписи переходов для строки: те же слова, что в карточке (StatusPanel), но без
 * импорта её внутренней таблицы — строка не тянет весь компонент панели.
 */
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

export interface TaskRowProps {
  task: TaskRowModel;
  objectTitle: string | undefined;
  assigneeName: string | undefined;
  authorName: string | undefined;
  role: UserRole;
}

/** Стили действия: основной переход — акцент, возврат на доработку — предупреждение. */
function actionClass(target: TaskStatus): string {
  if (target === 'rework') {
    return 'rounded-sm border border-amber/60 px-3 py-1.5 text-xs text-amber transition hover:border-amber disabled:opacity-40';
  }
  return 'rounded-sm bg-cyan px-3 py-1.5 text-xs font-semibold text-bg-0 transition hover:shadow-glow-cyan disabled:opacity-40';
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-text-mute">{label}</dt>
      <dd className="mt-0.5 text-sm text-text">{children}</dd>
    </div>
  );
}

export function TaskRow({
  task,
  objectTitle,
  assigneeName,
  authorName,
  role,
}: TaskRowProps): JSX.Element {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (target: TaskStatus) => changeTaskStatus(task.id, target),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['task', task.id] }),
      ]);
    },
  });

  // После успешного RPC в строке сразу учитываем новый статус (DEC-058).
  const effectiveStatus: TaskStatus = mutation.data ?? task.status;
  const targets = allowedTargets(effectiveStatus, role);
  const frozen = effectiveStatus === 'accepted';
  const error = mutation.error ? mutation.error.message : null;
  const description = task.description.trim();

  return (
    <article
      aria-label={`Задача ${task.title}`}
      className="border-b border-stroke px-3 py-3 last:border-b-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <dl className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Название">
            <Link
              to={`/tasks/${task.id}`}
              className="font-medium text-text transition hover:text-cyan"
            >
              {task.title}
            </Link>
          </Field>
          <Field label="Объект">{objectTitle ?? 'Объект недоступен'}</Field>
          <Field label="Статус">
            <StatusBadge status={effectiveStatus} />
          </Field>
          <Field label="Исполнитель">{assigneeName ?? 'Участник'}</Field>
          <Field label="Автор">{authorName ?? 'Участник'}</Field>
          <Field label="Дата создания">
            <span className="font-mono text-xs text-text-dim">
              {formatMoscowDateTime(task.created_at)}
            </span>
          </Field>
          <div className="min-w-0 sm:col-span-2 lg:col-span-3">
            <dt className="text-[10px] uppercase tracking-wide text-text-mute">Описание</dt>
            <dd
              className={
                description
                  ? 'mt-0.5 line-clamp-2 whitespace-pre-line text-sm text-text-dim'
                  : 'mt-0.5 text-sm text-text-mute'
              }
            >
              {description || 'Описание не добавлено'}
            </dd>
          </div>
        </dl>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-xs text-text-dim">
            {mutation.isPending ? 'Сохраняем…' : ''}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {frozen ? (
              <span role="status" className="text-xs text-text-dim">
                Статус зафиксирован
              </span>
            ) : (
              targets.map((target) =>
                requiresComment(effectiveStatus, target) ? (
                  <Link
                    key={target}
                    to={`/tasks/${task.id}`}
                    className={actionClass(target)}
                    aria-label={`${transitionLabel(effectiveStatus, target)}: ${task.title} (в карточке)`}
                  >
                    {transitionLabel(effectiveStatus, target)}
                  </Link>
                ) : (
                  <button
                    key={target}
                    type="button"
                    disabled={mutation.isPending}
                    aria-label={`${transitionLabel(effectiveStatus, target)}: ${task.title}`}
                    onClick={() => {
                      mutation.mutate(target);
                    }}
                    className={actionClass(target)}
                  >
                    {transitionLabel(effectiveStatus, target)}
                  </button>
                ),
              )
            )}
            {!frozen && targets.length === 0 ? (
              <span className="text-xs text-text-mute">Действий нет</span>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-rose">
          {error}
        </p>
      ) : null}
    </article>
  );
}
