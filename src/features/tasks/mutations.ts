/**
 * Мутации задачи: смена статуса и архивирование.
 *
 * Инварианты:
 *  - статус меняется только RPC `change_task_status` D03; прямого `PATCH status` нет (INV-003);
 *  - комментарий передаётся как есть (обрезанный), обязательность проверяет БД: возврат
 *    на доработку без текста отклоняется `P0422 comment_required`;
 *  - клиент не решает, разрешён ли переход: матрицу проверяет функция, а UI лишь рисует
 *    кнопки из `transitions.ts` для удобства (T14);
 *  - архивирование идемпотентно и доступно только `manager`; повтор не создаёт ошибку;
 *  - ошибки RPC переводятся в доменные тексты, SQLSTATE пользователю не показывается.
 */
import { postgrestJson, postgrestVoid } from '../../shared/api/postgrest.js';
import { parseRpcStatus, TaskApiError, toTaskError } from './api.js';
import type { TaskStatus } from './types.js';

/** Смена статуса: возвращает новый статус, подтверждённый сервером (A07.3). */
export async function changeTaskStatus(
  id: string,
  target: TaskStatus,
  comment?: string,
): Promise<TaskStatus> {
  const trimmed = comment?.trim() ?? '';
  let value: unknown;
  try {
    value = await postgrestJson('rpc/change_task_status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_task_id: id,
        p_target: target,
        p_comment: trimmed.length > 0 ? trimmed : null,
      }),
    });
  } catch (error) {
    throw toTaskError(error, 'Не удалось изменить статус задачи');
  }
  return parseRpcStatus(value);
}

/** Архивирование задачи: RPC `archive_task`, повторный вызов безопасен. */
export async function archiveTask(id: string): Promise<void> {
  try {
    await postgrestVoid('rpc/archive_task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_task_id: id }),
    });
  } catch (error) {
    throw toTaskError(error, 'Не удалось переместить задачу в архив');
  }
}

/** Ошибка домена задачи для тестов и UI (реэкспорт, чтобы не тянуть api.ts дважды). */
export { TaskApiError };
