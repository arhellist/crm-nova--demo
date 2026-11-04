/**
 * Валидация входа объекта до сети (A05.2) и схема ответа PostgREST.
 *
 * Границы:
 *  - `title` 1..200 и `address` 1..300 после `trim`; пустая строка из пробелов не проходит;
 *  - неизвестные ключи отбрасываются `.strip()`, поэтому `id`, `created_at`, `archived_at`
 *    и любые служебные поля в тело запроса не попадают (T12);
 *  - ответ БД валидируется до состояния компонента: лишние колонки не просачиваются.
 */
import { z } from 'zod';

export const objectInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Укажите название').max(200, 'Не длиннее 200 символов'),
    address: z.string().trim().min(1, 'Укажите адрес').max(300, 'Не длиннее 300 символов'),
  })
  .strip();

export type ObjectInputParsed = z.infer<typeof objectInputSchema>;

export const objectRowSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  address: z.string().min(1).max(300),
  created_at: z.string().min(1),
  archived_at: z.string().nullable(),
});
