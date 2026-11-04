/**
 * Мутации объектов.
 *
 * Архивирование — только RPC `archive_object` (D03): клиент не выставляет `archived_at`
 * прямым UPDATE. После успеха кэш `['objects']` инвалидируется; повторный вызов
 * идемпотентен на стороне БД, поэтому двойной клик не создаёт ошибку.
 */
import type { QueryClient } from '@tanstack/react-query';
import { postgrestVoid } from '../../shared/api/postgrest.js';

export async function archiveObject(id: string, queryClient: QueryClient): Promise<void> {
  await postgrestVoid('rpc/archive_object', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_object_id: id }),
  });
  await queryClient.invalidateQueries({ queryKey: ['objects'] });
}
