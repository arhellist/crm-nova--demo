/**
 * Матрица переходов для отрисовки кнопок статусов.
 *
 * Важно: это **не** проверка прав. Источник истины — `rpc.change_task_status` и триггеры БД;
 * функция лишь не показывает заведомо недоступные кнопки (T14). Если она разойдётся с БД,
 * сервер всё равно отклонит переход `P0422`, поэтому таблица повторяет §1 `domain-rules.md`
 * буквально: исполнитель двигает свои задачи, постановщик принимает и возвращает.
 */
import type { TaskStatus, UserRole } from './types.js';

interface TransitionRule {
  target: TaskStatus;
  role: UserRole;
}

const RULES: Record<TaskStatus, readonly TransitionRule[]> = {
  new: [{ target: 'in_progress', role: 'executor' }],
  in_progress: [{ target: 'on_review', role: 'executor' }],
  on_review: [
    { target: 'accepted', role: 'manager' },
    { target: 'rework', role: 'manager' },
  ],
  rework: [{ target: 'in_progress', role: 'executor' }],
  accepted: [],
};

/** Куда можно перейти из статуса для данной роли; пустой массив — действий нет. */
export function allowedTargets(status: TaskStatus, role: UserRole): TaskStatus[] {
  return RULES[status].filter((rule) => rule.role === role).map((rule) => rule.target);
}

/** Требуется ли комментарий для пары: только возврат на доработку (§3 domain-rules). */
export function requiresComment(status: TaskStatus, target: TaskStatus): boolean {
  return status === 'on_review' && target === 'rework';
}
