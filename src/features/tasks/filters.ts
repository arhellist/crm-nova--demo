/**
 * Фильтр экрана «Мои задачи» и его сериализация в URL.
 *
 * Инварианты:
 *  - значение по умолчанию — `all`; неизвестное или пустое значение query-параметра
 *    не ломает экран, а трактуется как `all`;
 *  - в URL попадает только выбранный статус: `?status=in_progress`; для `all` параметр
 *    отсутствует, поэтому ссылка на экран остаётся короткой;
 *  - фильтр по исполнителю не выражается здесь вовсе — его делает RLS (SEC-04, A09.2).
 */
import type { TaskStatus } from './types.js';

export const MY_TASKS_FILTERS = [
  'all',
  'new',
  'in_progress',
  'on_review',
  'rework',
  'accepted',
] as const;

export type MyTasksFilter = (typeof MY_TASKS_FILTERS)[number];

/** Порядок вкладок и групп совпадает с циклом из пяти статусов (§1 domain-rules). */
export const MY_TASKS_TABS: readonly { value: MyTasksFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'on_review', label: 'На проверке' },
  { value: 'rework', label: 'На доработке' },
  { value: 'accepted', label: 'Принятые' },
];

/** Разбор query-параметра: всё незнакомое сводится к `all`. */
export function parseMyTasksFilter(value: string | null | undefined): MyTasksFilter {
  if (!value) {
    return 'all';
  }
  return (MY_TASKS_FILTERS as readonly string[]).includes(value)
    ? (value as MyTasksFilter)
    : 'all';
}

/** Значение query-параметра: `null` означает «параметр не нужен» (вкладка «Все»). */
export function serializeMyTasksFilter(filter: MyTasksFilter): string | null {
  return filter === 'all' ? null : filter;
}

/** Статус для PostgREST-фильтра `status=eq.<value>`; для `all` фильтра нет. */
export function filterStatus(filter: MyTasksFilter): TaskStatus | null {
  return filter === 'all' ? null : filter;
}
