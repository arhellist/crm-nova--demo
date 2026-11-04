/**
 * Валидация входа задачи до сети и схема ответа PostgREST.
 *
 * Границы:
 *  - `title` 1..200 и `description` до 5000 после `trim` — лимит из §9 `domain-rules.md`
 *    (в HOW D07 стояло 2000; спецификация выше задания, см. DEC-016);
 *  - `object_id` и `assignee_id` — uuid: нечисловые идентификаторы отсекаются до запроса;
 *  - `.strip()` выбрасывает `status`, `author_id`, `archived_at` и любые лишние ключи (T14);
 *  - ответ БД валидируется Zod: лишние колонки не попадают в состояние экрана.
 */
import { z } from 'zod';

export const taskStatusSchema = z.enum(['new', 'in_progress', 'on_review', 'rework', 'accepted']);

export const taskInputSchema = z
  .object({
    object_id: z.string().uuid('Выберите объект'),
    title: z.string().trim().min(1, 'Укажите название').max(200, 'Не длиннее 200 символов'),
    description: z.string().trim().max(5000, 'Не длиннее 5000 символов').optional(),
    assignee_id: z.string().uuid('Выберите исполнителя'),
  })
  .strip();

export type TaskInputParsed = z.infer<typeof taskInputSchema>;

export const taskRowSchema = z.object({
  id: z.string().uuid(),
  object_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000),
  status: taskStatusSchema,
  assignee_id: z.string().uuid(),
  author_id: z.string().uuid(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  archived_at: z.string().nullable(),
});
