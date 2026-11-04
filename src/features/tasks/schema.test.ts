// @vitest-environment node
/**
 * Тесты схемы задачи: служебные поля не проходят во вход.
 *
 * @acceptance A07.5
 */
import { describe, expect, it } from 'vitest';
import { taskInputSchema } from './schema.js';

const objectId = '33333333-3333-4333-8333-333333333333';
const assigneeId = '22222222-2222-4222-8222-222222222222';
const authorId = '11111111-1111-4111-8111-111111111111';

describe('taskInputSchema', () => {
  it('A07.5 статус и автор не входят во вход даже если пришли из формы', () => {
    const parsed = taskInputSchema.parse({
      object_id: objectId,
      title: '  Монтаж окон  ',
      description: '  Второй этаж  ',
      assignee_id: assigneeId,
      status: 'accepted',
      author_id: authorId,
      archived_at: '2026-11-01T10:00:00Z',
    });

    expect(parsed).toEqual({
      object_id: objectId,
      title: 'Монтаж окон',
      description: 'Второй этаж',
      assignee_id: assigneeId,
    });
    expect(parsed).not.toHaveProperty('status');
    expect(parsed).not.toHaveProperty('author_id');
  });
});
