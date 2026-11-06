// @vitest-environment node
/**
 * Тесты прав: исполнитель не создаёт и не правит объекты (DEC-053 gateway).
 *
 * @acceptance A05.3
 * @acceptance A05.6
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createObject, updateObject } from './api.js';
import { stubApiFetch } from '../../test/stub-api-fetch.js';

function errorResponse(status: number, code: string): Response {
  return new Response(JSON.stringify({ code, message: 'permission denied for table objects' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('права на объекты', () => {
  it('A05.3 исполнитель: создание отклонено 42501, ни одной записи', async () => {
    stubApiFetch(() => errorResponse(403, '42501'));

    await expect(
      createObject({ title: 'Новый объект', address: 'ул. Тестовая, 1' }),
    ).rejects.toMatchObject({ message: 'Недостаточно прав' });
  });

  it('A05.6 исполнитель: правка чужого объекта даёт 0 строк и понятную ошибку', async () => {
    stubApiFetch((url, init) => {
      expect(url).toContain('/api/data/objects?id=eq.44444444-4444-4444-8444-444444444444');
      expect(init?.method).toBe('PATCH');
      const body = z.record(z.unknown()).parse(JSON.parse(String(init?.body)));
      expect(body).toEqual({ title: 'Подменённое название', address: 'ул. Тестовая, 2' });
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await expect(
      updateObject('44444444-4444-4444-8444-444444444444', {
        title: 'Подменённое название',
        address: 'ул. Тестовая, 2',
      }),
    ).rejects.toMatchObject({ message: 'Объект не найден или недоступен' });
  });
});
