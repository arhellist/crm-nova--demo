/**
 * Карточка задачи: данные, панель переходов и история.
 *
 * Инварианты:
 *  - статус на экране — из ответа сервера; панель не меняет его оптимистично (A08.5);
 *  - архивная задача не предлагает переходов и правки (INV-008): по RLS она и не читается,
 *    поэтому состояние остаётся защитой от гонки, а не основным сценарием;
 *  - роль берётся из `profiles` через `useSession`, а не из JWT (INV-005);
 *  - история и имена подгружаются отдельными запросами, карточка не ждёт их для заголовка.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../auth/useSession.js';
import { HistoryList, StatusBadge, formatMoscowDateTime } from './HistoryList.js';
import { StatusPanel } from './StatusPanel.js';
import { TaskForm } from './TaskForm.js';
import { useObjectTitles } from './useMyTasks.js';
import { useTask, useTaskHistory, useTaskPeople } from './useTask.js';
import type { TaskRow } from './types.js';

function TaskHeader({ task }: { task: TaskRow }): JSX.Element {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <h1 className="text-[28px] font-semibold tracking-tight text-text">{task.title}</h1>
      <StatusBadge status={task.status} />
      {task.archived_at ? (
        <span className="inline-flex items-center rounded-sm border border-stroke-strong px-2 py-0.5 text-xs text-text-dim">
          Архив
        </span>
      ) : null}
    </div>
  );
}

export function TaskPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const session = useSession();
  const taskId = params.id ?? '';

  const { task, isLoading, isError } = useTask(taskId);
  const history = useTaskHistory(taskId);
  const [editing, setEditing] = useState(false);
  const objectTitles = useObjectTitles(task ? [task.object_id] : []);

  const people = useTaskPeople([
    ...(task ? [task.assignee_id, task.author_id] : []),
    ...history.rows.map((row) => row.changed_by),
  ]);

  if (!taskId) {
    return (
      <section className="p-6">
        <p role="alert" className="text-sm text-text">
          Задача не найдена.
        </p>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="p-6">
        <p role="status" className="text-text-dim">
          Загрузка задачи…
        </p>
      </section>
    );
  }

  if (isError || !task) {
    return (
      <section className="p-6">
        <div role="alert" className="rounded-sm border border-rose/60 bg-bg-1 p-4">
          <p className="text-sm text-text">Задача не найдена или недоступна.</p>
          <Link to="/my" className="mt-3 inline-block text-sm text-cyan underline">
            К моим задачам
          </Link>
        </div>
      </section>
    );
  }

  const role = session.profile?.role ?? 'executor';
  const archived = task.archived_at !== null;

  return (
    <section className="p-6">
      <Link
        to={`/objects/${task.object_id}`}
        className="text-sm text-text-dim transition hover:text-cyan"
      >
        ← К объекту
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <TaskHeader task={task} />
        {role === 'manager' && !archived ? (
          <button
            type="button"
            aria-label="Изменить задачу"
            onClick={() => setEditing(true)}
            className="rounded-sm border border-stroke px-4 py-2 text-sm text-text-dim transition hover:border-stroke-strong hover:text-text"
          >
            Изменить
          </button>
        ) : null}
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="text-xs uppercase tracking-wide text-text-mute">Название</dt>
          <dd className="mt-1 text-text">{task.title}</dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="text-xs uppercase tracking-wide text-text-mute">Описание</dt>
          <dd
            className={
              task.description.trim()
                ? 'mt-1 max-w-[72ch] whitespace-pre-line text-text-dim'
                : 'mt-1 text-text-mute'
            }
          >
            {task.description.trim() || 'Описание не добавлено'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-mute">Объект</dt>
          <dd className="mt-1">
            <Link
              to={`/objects/${task.object_id}`}
              className="text-cyan transition hover:underline"
            >
              {objectTitles[task.object_id] ?? 'Объект недоступен'}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-mute">Исполнитель</dt>
          <dd className="mt-1 text-text">{people[task.assignee_id] ?? 'Участник'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-mute">Статус</dt>
          <dd className="mt-1">
            <StatusBadge status={task.status} />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-mute">Автор</dt>
          <dd className="mt-1 text-text">{people[task.author_id] ?? 'Участник'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-mute">Дата создания</dt>
          <dd className="mt-1 font-mono text-xs text-text-dim">
            {formatMoscowDateTime(task.created_at)}
          </dd>
        </div>
      </dl>

      {!archived ? <StatusPanel taskId={task.id} status={task.status} role={role} /> : null}

      <HistoryList
        rows={history.rows}
        people={people}
        isLoading={history.isLoading}
        isError={history.isError}
      />

      {editing ? (
        <TaskForm
          mode="edit"
          task={task}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
          }}
        />
      ) : null}
    </section>
  );
}
