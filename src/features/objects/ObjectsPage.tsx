/**
 * Экран объектов: список с поиском и карточка объекта.
 *
 * Инварианты:
 *  - кнопки управления рендерятся только `manager`; скрытие кнопки — удобство, а не защита:
 *    права всё равно проверяет RLS (INV-002, SEC-05);
 *  - архивный объект читаем, помечен бейджем «Архив» и не теряет задачи (A06.5);
 *  - пагинация — только курсором D05, кнопка «Показать ещё» не подменяется `offset`;
 *  - архивный объект не удаляется: единственное действие — RPC `archive_object` (D03);
 *  - ошибки показываются текстами D05: без SQL, имён таблиц и факта существования чужих строк.
 */
import { useId, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../auth/useSession.js';
import { listTasksByObject } from '../tasks/api.js';
import { StatusBadge, formatMoscowDateTime } from '../tasks/HistoryList.js';
import { TaskForm } from '../tasks/TaskForm.js';
import { createObject, getObject, updateObject } from './api.js';
import { archiveObject } from './mutations.js';
import { ObjectArchiveDialog } from './ObjectArchiveDialog.js';
import { ObjectForm } from './ObjectForm.js';
import { objectKeys } from './objectKeys.js';
import { useObjects } from './useObjects.js';
import type { ObjectInput, ObjectRow } from './types.js';

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

function ArchiveBadge(): JSX.Element {
  return (
    <span className="inline-flex items-center rounded-sm border border-stroke-strong px-2 py-0.5 text-xs text-text-dim">
      Архив
    </span>
  );
}

function RowActions({
  row,
  onEdit,
  onArchive,
}: {
  row: ObjectRow;
  onEdit: () => void;
  onArchive: () => void;
}): JSX.Element | null {
  if (row.archived_at !== null) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2 md:justify-end">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Изменить объект ${row.title}`}
        className="rounded-sm border border-stroke px-3 py-1 text-xs text-text-dim transition hover:border-stroke-strong hover:text-text"
      >
        Изменить
      </button>
      <button
        type="button"
        onClick={onArchive}
        aria-label={`Архивировать объект ${row.title}`}
        className="rounded-sm border border-rose/50 px-3 py-1 text-xs text-rose transition hover:border-rose"
      >
        В архив
      </button>
    </div>
  );
}

/** Список объектов с поиском по загруженным страницам и keyset-пагинацией. */
function ObjectList({ isManager }: { isManager: boolean }): JSX.Element {
  const searchId = useId();
  const archivedId = useId();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [form, setForm] = useState<{ mode: 'create' } | { mode: 'edit'; object: ObjectRow } | null>(
    null,
  );
  const [archiveTarget, setArchiveTarget] = useState<ObjectRow | null>(null);

  const objects = useObjects({ q: search, includeArchived });

  const createMutation = useMutation({
    mutationFn: (input: ObjectInput) => createObject(input),
  });
  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; input: ObjectInput }) =>
      updateObject(payload.id, payload.input),
  });
  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveObject(id, queryClient),
  });

  async function handleSubmit(input: ObjectInput): Promise<void> {
    if (form?.mode === 'edit') {
      await updateMutation.mutateAsync({ id: form.object.id, input });
      await queryClient.invalidateQueries({ queryKey: objectKeys.detail(form.object.id) });
    } else {
      await createMutation.mutateAsync(input);
    }
    // Инвалидация точечная: список перезапрашивается, карточка правится отдельно.
    await queryClient.invalidateQueries({ queryKey: objectKeys.lists() });
    setForm(null);
  }

  async function handleArchive(): Promise<void> {
    if (!archiveTarget) {
      return;
    }
    await archiveMutation.mutateAsync(archiveTarget.id);
    setArchiveTarget(null);
  }

  return (
    <section className="p-6" aria-labelledby="objects-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="objects-title" className="text-[28px] font-semibold tracking-tight text-text">
            Объекты
          </h1>
          <p className="mt-1 text-sm text-text-dim">Стройплощадки и их задачи.</p>
        </div>
        {isManager ? (
          <button
            type="button"
            aria-label="Новый объект"
            onClick={() => setForm({ mode: 'create' })}
            className="rounded-sm bg-cyan px-4 py-2 text-sm font-semibold text-bg-0 transition hover:shadow-glow-cyan"
          >
            Объект
          </button>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <div className="min-w-[240px] flex-1">
          <label htmlFor={searchId} className="block text-sm font-medium text-text">
            Поиск
          </label>
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Название или адрес"
            className="mt-2 w-full rounded-sm border border-stroke bg-bg-1 px-3 py-2 text-text"
          />
        </div>
        <label htmlFor={archivedId} className="flex items-center gap-2 text-sm text-text-dim">
          <input
            id={archivedId}
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
            className="h-4 w-4 rounded-sm border border-stroke bg-bg-1"
          />
          Показать архивные
        </label>
      </div>

      {objects.isLoading ? (
        <div role="status" className="mt-6 space-y-2" aria-live="polite">
          <p className="sr-only">Загрузка объектов…</p>
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-12 animate-pulse rounded-sm bg-bg-2" />
          ))}
        </div>
      ) : null}

      {objects.isError ? (
        <div role="alert" className="mt-6 rounded-sm border border-rose/60 bg-bg-1 p-4">
          <p className="text-sm text-text">Не удалось загрузить объекты.</p>
          <button
            type="button"
            onClick={() => void objects.refetch()}
            className="mt-3 rounded-sm border border-stroke px-3 py-1.5 text-sm text-text-dim hover:border-stroke-strong hover:text-text"
          >
            Повторить
          </button>
        </div>
      ) : null}

      {!objects.isLoading && !objects.isError && objects.items.length === 0 ? (
        <div className="mt-6 rounded-md border border-stroke bg-panel p-8 text-center">
          <p className="text-[18px] font-semibold text-text">Объектов пока нет</p>
          <p className="mt-1 text-sm text-text-dim">
            {isManager
              ? 'Создайте первый объект, чтобы ставить по нему задачи.'
              : 'Объекты появятся, когда руководитель назначит вам задачу.'}
          </p>
          {isManager ? (
            <button
              type="button"
              aria-label="Создать объект"
              onClick={() => setForm({ mode: 'create' })}
              className="mt-4 rounded-sm bg-cyan px-4 py-2 text-sm font-semibold text-bg-0 transition hover:shadow-glow-cyan"
            >
              Создать объект
            </button>
          ) : null}
        </div>
      ) : null}

      {objects.items.length > 0 ? (
        <>
          <div className="mt-6 hidden grid-cols-[minmax(0,2fr)_minmax(0,2fr)_100px_120px_auto] gap-4 border-b border-stroke px-4 pb-2 text-xs uppercase tracking-wide text-text-mute md:grid">
            <span>Название</span>
            <span>Адрес</span>
            <span>Задачи</span>
            <span>Создан</span>
            <span className="text-right">Действия</span>
          </div>
          <ul aria-label="Список объектов" className="mt-2 md:mt-0">
            {objects.items.map((row) => (
              <li
                key={row.id}
                className="grid grid-cols-1 gap-1 border-b border-stroke px-4 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_100px_120px_auto] md:items-center md:gap-4"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Link
                    to={`/objects/${row.id}`}
                    className="truncate text-[15px] font-medium text-text transition hover:text-cyan"
                  >
                    {row.title}
                  </Link>
                  {row.archived_at ? <ArchiveBadge /> : null}
                </div>
                <span className="text-sm text-text-dim">{row.address}</span>
                {/* Число задач приходит из данных задач (D07); до контракта задач счётчика нет. */}
                <span aria-label="Число задач" className="text-sm text-text-mute md:text-center">
                  —
                </span>
                <span className="font-mono text-xs text-text-mute">{formatDate(row.created_at)}</span>
                {isManager ? (
                  <RowActions
                    row={row}
                    onEdit={() => setForm({ mode: 'edit', object: row })}
                    onArchive={() => setArchiveTarget(row)}
                  />
                ) : null}
              </li>
            ))}
          </ul>

          {objects.hasNextPage ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => void objects.fetchNextPage()}
                disabled={objects.isFetchingNextPage}
                className="rounded-sm border border-stroke px-4 py-2 text-sm text-text-dim transition hover:border-stroke-strong hover:text-text disabled:opacity-40"
              >
                {objects.isFetchingNextPage ? 'Загрузка…' : 'Показать ещё'}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {form ? (
        <ObjectForm
          mode={form.mode}
          {...(form.mode === 'edit' ? { object: form.object } : {})}
          onCancel={() => setForm(null)}
          onSubmit={handleSubmit}
        />
      ) : null}

      {archiveTarget ? (
        <ObjectArchiveDialog
          object={archiveTarget}
          onCancel={() => setArchiveTarget(null)}
          onConfirm={handleArchive}
        />
      ) : null}
    </section>
  );
}

/** Карточка объекта: данные, бейдж архива, задачи (контракт D07) и управление. */
function ObjectDetail({ id, isManager }: { id: string; isManager: boolean }): JSX.Element {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);

  const object = useQuery({
    queryKey: objectKeys.detail(id),
    queryFn: () => getObject(id),
  });

  // Задачи объекта: контракт D07, курсорная пагинация; экран показывает первую страницу.
  const tasks = useQuery({
    queryKey: objectKeys.tasks(id),
    queryFn: () => listTasksByObject(id, { limit: 20 }),
  });

  const updateMutation = useMutation({
    mutationFn: (input: ObjectInput) => updateObject(id, input),
  });
  const archiveMutation = useMutation({
    mutationFn: () => archiveObject(id, queryClient),
  });

  async function handleSubmit(input: ObjectInput): Promise<void> {
    await updateMutation.mutateAsync(input);
    await queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) });
    await queryClient.invalidateQueries({ queryKey: objectKeys.lists() });
    setEditing(false);
  }

  async function handleArchive(): Promise<void> {
    await archiveMutation.mutateAsync();
    await queryClient.invalidateQueries({ queryKey: objectKeys.detail(id) });
    setArchiving(false);
  }

  if (object.isLoading) {
    return (
      <section className="p-6">
        <p role="status" className="text-text-dim">
          Загрузка объекта…
        </p>
      </section>
    );
  }

  if (object.isError || !object.data) {
    return (
      <section className="p-6">
        <div role="alert" className="rounded-sm border border-rose/60 bg-bg-1 p-4">
          <p className="text-sm text-text">Объект не найден или недоступен.</p>
          <Link to="/objects" className="mt-3 inline-block text-sm text-cyan underline">
            К списку объектов
          </Link>
        </div>
      </section>
    );
  }

  const row = object.data;
  const archived = row.archived_at !== null;

  return (
    <section className="p-6" aria-labelledby="object-title">
      <Link to="/objects" className="text-sm text-text-dim transition hover:text-cyan">
        ← К списку объектов
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 id="object-title" className="text-[28px] font-semibold tracking-tight text-text">
              {row.title}
            </h1>
            {archived ? <ArchiveBadge /> : null}
          </div>
          <p className="mt-1 text-sm text-text-dim">{row.address}</p>
          <p className="mt-1 font-mono text-xs text-text-mute">
            Создан {formatDate(row.created_at)}
          </p>
        </div>

        {isManager && !archived ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-label="Изменить объект"
              onClick={() => setEditing(true)}
              className="rounded-sm border border-stroke px-4 py-2 text-sm text-text-dim transition hover:border-stroke-strong hover:text-text"
            >
              Изменить
            </button>
            <button
              type="button"
              aria-label="Архивировать объект"
              onClick={() => setArchiving(true)}
              className="rounded-sm border border-rose/50 px-4 py-2 text-sm text-rose transition hover:border-rose"
            >
              В архив
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-8 rounded-md border border-stroke bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[18px] font-semibold text-text">Задачи</h2>
          {isManager && !archived ? (
            <button
              type="button"
              aria-label="Создать задачу"
              onClick={() => setCreatingTask(true)}
              className="rounded-sm bg-cyan px-3 py-1.5 text-sm font-semibold text-bg-0 transition hover:shadow-glow-cyan"
            >
              Задача
            </button>
          ) : null}
        </div>

        {tasks.isLoading ? (
          <p role="status" className="mt-3 text-sm text-text-dim">
            Загрузка задач…
          </p>
        ) : null}

        {tasks.isError ? (
          <div role="alert" className="mt-3">
            <p className="text-sm text-rose">Не удалось загрузить задачи.</p>
            <button
              type="button"
              onClick={() => void tasks.refetch()}
              className="mt-2 rounded-sm border border-stroke px-3 py-1.5 text-sm text-text-dim hover:border-stroke-strong hover:text-text"
            >
              Повторить
            </button>
          </div>
        ) : null}

        {!tasks.isLoading && !tasks.isError && (tasks.data?.items.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-text-mute">Задач пока нет.</p>
        ) : null}

        {tasks.data && tasks.data.items.length > 0 ? (
          <ul aria-label="Задачи объекта" className="mt-3 divide-y divide-stroke">
            {tasks.data.items.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center gap-3 py-2">
                <Link
                  to={`/tasks/${task.id}`}
                  className="min-w-0 flex-1 truncate text-sm text-text transition hover:text-cyan"
                >
                  {task.title}
                </Link>
                <StatusBadge status={task.status} />
                <span className="font-mono text-xs text-text-mute">
                  {formatMoscowDateTime(task.created_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {editing ? (
        <ObjectForm
          mode="edit"
          object={row}
          onCancel={() => setEditing(false)}
          onSubmit={handleSubmit}
        />
      ) : null}

      {archiving ? (
        <ObjectArchiveDialog
          object={row}
          onCancel={() => setArchiving(false)}
          onConfirm={handleArchive}
        />
      ) : null}

      {creatingTask ? (
        <TaskForm
          mode="create"
          objectId={row.id}
          onCancel={() => setCreatingTask(false)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: objectKeys.tasks(row.id) });
            setCreatingTask(false);
          }}
        />
      ) : null}
    </section>
  );
}

export function ObjectsPage(): JSX.Element {
  const session = useSession();
  const params = useParams<{ id?: string }>();
  const isManager = session.profile?.role === 'manager';

  if (params.id) {
    return <ObjectDetail id={params.id} isManager={isManager} />;
  }
  return <ObjectList isManager={isManager} />;
}
