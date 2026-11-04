/**
 * Экран «Мои задачи»: вкладки по статусам, счётчики и переход в один клик.
 *
 * Инварианты:
 *  - список — только задачи текущего пользователя: фильтр исполнителя не передаётся,
 *    его делает RLS (SEC-04, A09.2);
 *  - активная вкладка грузит серверную выборку `status=eq.<value>`, поэтому «Все» и статусные
 *    вкладки не теряют задачи за границей страницы; «Все» показывает группы по пяти статусам;
 *  - счётчики — из агрегата `select=status`, без `COUNT(*)`; если данных больше лимита или
 *    активная страница не последняя, число помечается «+» (A09.5), а не выдаётся за точное;
 *  - переход из строки — тот же RPC, что в карточке; после успеха строка переезжает
 *    в другую вкладку, потому что инвалидируется весь префикс `['my-tasks']` (A09.3);
 *  - пустое состояние объясняет, что делать, и не рисует пустые группы (A09.6).
 */
import { useMemo } from 'react';
import type { KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../auth/useSession.js';
import { STATUS_LABELS } from './HistoryList.js';
import { TaskRow } from './TaskRow.js';
import {
  MY_TASKS_TABS,
  parseMyTasksFilter,
  serializeMyTasksFilter,
  type MyTasksFilter,
} from './filters.js';
import {
  MY_TASKS_STATUS_ORDER,
  useMyTasks,
  useMyTasksCounters,
  useObjectTitles,
} from './useMyTasks.js';
import type { TaskRow as TaskRowModel, TaskStatus } from './types.js';

interface TaskGroup {
  status: TaskStatus;
  items: TaskRowModel[];
}

export function MyTasksPage(): JSX.Element {
  const session = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = parseMyTasksFilter(searchParams.get('status'));
  const list = useMyTasks(filter);
  const counters = useMyTasksCounters();
  const objectTitles = useObjectTitles(list.items.map((task) => task.object_id));

  const groups = useMemo<TaskGroup[]>(() => {
    if (filter !== 'all') {
      return [{ status: filter, items: list.items }];
    }
    return MY_TASKS_STATUS_ORDER.map((status) => ({
      status,
      items: list.items.filter((task) => task.status === status),
    })).filter((group) => group.items.length > 0);
  }, [filter, list.items]);

  function selectFilter(next: MyTasksFilter): void {
    const value = serializeMyTasksFilter(next);
    const params = new URLSearchParams(searchParams);
    if (value === null) {
      params.delete('status');
    } else {
      params.set('status', value);
    }
    setSearchParams(params, { replace: true });
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const keys: Record<string, number> = {
      ArrowRight: (index + 1) % MY_TASKS_TABS.length,
      ArrowLeft: (index - 1 + MY_TASKS_TABS.length) % MY_TASKS_TABS.length,
      Home: 0,
      End: MY_TASKS_TABS.length - 1,
    };
    const nextIndex = keys[event.key];
    if (nextIndex === undefined) {
      return;
    }
    event.preventDefault();
    const next = MY_TASKS_TABS[nextIndex];
    if (!next) {
      return;
    }
    selectFilter(next.value);
    document.getElementById(`my-tasks-tab-${next.value}`)?.focus();
  }

  /**
   * Число на вкладке. Точный счётчик берётся из агрегата; когда активная страница не последняя,
   * показывается «загружено+», чтобы «20» не выглядело полным числом задач (A09.5).
   */
  function tabCount(tab: MyTasksFilter): string {
    if (tab === filter && list.hasNextPage) {
      return `${list.items.length}+`;
    }
    const count = counters.counts[tab];
    return counters.truncated ? `${count}+` : String(count);
  }

  const role = session.profile?.role ?? 'executor';
  const activeTab = MY_TASKS_TABS.find((tab) => tab.value === filter) ?? MY_TASKS_TABS[0];

  return (
    <section className="p-6" aria-labelledby="my-tasks-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="my-tasks-title" className="text-[28px] font-semibold tracking-tight text-text">
            Мои задачи
          </h1>
          <p className="mt-1 text-sm text-text-dim">
            Задачи, назначенные на вас. Переход выполняется прямо из списка.
          </p>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Статусы моих задач"
        className="mt-5 flex flex-wrap gap-1 border-b border-stroke"
      >
        {MY_TASKS_TABS.map((tab, index) => {
          const selected = tab.value === filter;
          return (
            <button
              key={tab.value}
              id={`my-tasks-tab-${tab.value}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="my-tasks-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                selectFilter(tab.value);
              }}
              onKeyDown={(event) => {
                onTabKeyDown(event, index);
              }}
              className={
                selected
                  ? 'flex items-center gap-2 rounded-t-sm border-b-2 border-cyan px-3 py-2 text-sm font-medium text-text'
                  : 'flex items-center gap-2 rounded-t-sm border-b-2 border-transparent px-3 py-2 text-sm text-text-dim transition hover:text-text'
              }
            >
              {tab.label}
              <span
                aria-label={`задач: ${tabCount(tab.value)}`}
                className="rounded-sm bg-bg-2 px-1.5 py-0.5 font-mono text-[11px] text-text-dim"
              >
                {tabCount(tab.value)}
              </span>
            </button>
          );
        })}
      </div>

      <div
        id="my-tasks-panel"
        role="tabpanel"
        aria-labelledby={`my-tasks-tab-${activeTab?.value ?? 'all'}`}
      >
        {list.isLoading ? (
          <p role="status" className="mt-4 text-sm text-text-dim">
            Загрузка задач…
          </p>
        ) : null}

        {list.isError ? (
          <div role="alert" className="mt-4 rounded-sm border border-rose/60 bg-bg-1 p-4">
            <p className="text-sm text-rose">Не удалось загрузить задачи.</p>
            <button
              type="button"
              onClick={list.refetch}
              className="mt-2 rounded-sm border border-stroke px-3 py-1.5 text-sm text-text-dim transition hover:border-stroke-strong hover:text-text"
            >
              Повторить
            </button>
          </div>
        ) : null}

        {!list.isLoading && !list.isError && list.items.length === 0 ? (
          <div className="mt-6 rounded-sm border border-stroke border-dashed bg-panel p-6">
            <p className="text-sm text-text">Задач нет</p>
            <p className="mt-1 text-sm text-text-dim">
              {filter === 'all'
                ? 'Здесь появятся задачи, назначенные на вас. Новую задачу менеджер создаёт в карточке объекта.'
                : 'В этом статусе задач нет. Выберите другую вкладку.'}
            </p>
          </div>
        ) : null}

        {groups.map((group) => (
          <section key={group.status} aria-labelledby={`my-tasks-group-${group.status}`} className="mt-5">
            <h2
              id={`my-tasks-group-${group.status}`}
              className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-text-dim"
            >
              {STATUS_LABELS[group.status]}
              <span className="font-mono text-xs text-text-mute">{group.items.length}</span>
            </h2>
            <div className="mt-2 rounded-md border border-stroke bg-panel">
              {group.items.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  objectTitle={objectTitles[task.object_id]}
                  role={role}
                />
              ))}
            </div>
          </section>
        ))}

        {list.hasNextPage ? (
          <button
            type="button"
            onClick={list.fetchNextPage}
            disabled={list.isFetchingNextPage}
            className="mt-4 rounded-sm border border-stroke px-4 py-2 text-sm text-text-dim transition hover:border-stroke-strong hover:text-text disabled:opacity-40"
          >
            {list.isFetchingNextPage ? 'Загрузка…' : 'Показать ещё'}
          </button>
        ) : null}
      </div>
    </section>
  );
}
