/**
 * Строка списка «Мои задачи»: название, объект, статус, дата и основное действие.
 *
 * Инварианты:
 *  - набор действий — ровно `allowedTargets(status, role)`; это подсказка, а не защита:
 *    решение принимает `rpc.change_task_status` (INV-003);
 *  - обычный переход выполняется тем же RPC, что и в карточке, и только после успешного
 *    ответа строка меняет статус: оптимистичных обновлений нет (A09.3);
 *  - «На доработку» требует комментарий, поэтому ведёт в карточку задачи: строка не
 *    собирает текст и не отправляет пустой комментарий (DEC-022);
 *  - после успеха инвалидируются `['my-tasks']` (вкладки и счётчики), `['task']` и `['tasks']`,
 *    поэтому строка переезжает в свою вкладку без дублей;
 *  - ошибка перехода показывается в строке и не меняет статус.
 */
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
  role: UserRole;
}

/** Стили действия: основной переход — акцент, возврат на доработку — предупреждение. */
function actionClass(target: TaskStatus): string {
  if (target === 'rework') {
    return 'rounded-sm border border-amber/60 px-3 py-1.5 text-xs text-amber transition hover:border-amber disabled:opacity-40';
  }
  return 'rounded-sm bg-cyan px-3 py-1.5 text-xs font-semibold text-bg-0 transition hover:shadow-glow-cyan disabled:opacity-40';
}

export function TaskRow({ task, objectTitle, role }: TaskRowProps): JSX.Element {
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

  const targets = allowedTargets(task.status, role);
  const error = mutation.error ? mutation.error.message : null;

  return (
    <article
      aria-label={`Задача ${task.title}`}
      className="grid gap-2 border-b border-stroke px-3 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_180px_120px_110px_auto] md:items-center md:gap-3"
    >
      <div className="min-w-0">
        <Link
          to={`/tasks/${task.id}`}
          className="block truncate text-sm font-medium text-text transition hover:text-cyan"
        >
          {task.title}
        </Link>
        <span className="mt-0.5 block truncate text-xs text-text-mute">
          {objectTitle ?? 'Объект недоступен'}
        </span>
      </div>

      <div>
        <StatusBadge status={task.status} />
      </div>

      <span className="font-mono text-xs text-text-mute md:text-right">
        {formatMoscowDateTime(task.created_at)}
      </span>

      <span className="text-xs text-text-dim md:text-right">
        {mutation.isPending ? 'Сохраняем…' : ''}
      </span>

      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {targets.map((target) =>
          requiresComment(task.status, target) ? (
            <Link
              key={target}
              to={`/tasks/${task.id}`}
              className={actionClass(target)}
              aria-label={`${transitionLabel(task.status, target)}: ${task.title} (в карточке)`}
            >
              {transitionLabel(task.status, target)}
            </Link>
          ) : (
            <button
              key={target}
              type="button"
              disabled={mutation.isPending}
              aria-label={`${transitionLabel(task.status, target)}: ${task.title}`}
              onClick={() => {
                mutation.mutate(target);
              }}
              className={actionClass(target)}
            >
              {transitionLabel(task.status, target)}
            </button>
          ),
        )}
        {targets.length === 0 ? (
          <span className="text-xs text-text-mute">Действий нет</span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-rose md:col-span-5">
          {error}
        </p>
      ) : null}
    </article>
  );
}
