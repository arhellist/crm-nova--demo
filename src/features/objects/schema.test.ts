// @vitest-environment node
/**
 * Тесты схемы объекта: валидация до сети и отбрасывание служебных полей (T12).
 *
 * @acceptance A05.2
 */
import { describe, expect, it } from 'vitest';
import { objectInputSchema } from './schema.js';

describe('objectInputSchema', () => {
  it('A05.2 название из пробелов не проходит валидацию', () => {
    const result = objectInputSchema.safeParse({ title: '   ', address: 'ул. Лесная, 12' });
    expect(result.success).toBe(false);
  });

  it('A05.2 пустой адрес и превышение лимитов отклоняются', () => {
    expect(objectInputSchema.safeParse({ title: 'Дом', address: ' ' }).success).toBe(false);
    expect(
      objectInputSchema.safeParse({ title: 'Д'.repeat(201), address: 'ул. Лесная, 12' }).success,
    ).toBe(false);
  });

  it('A05.2 служебные поля отбрасываются, значения тримятся', () => {
    const result = objectInputSchema.parse({
      title: '  ЖК Северный  ',
      address: ' ул. Лесная, 12 ',
      id: '44444444-4444-4444-8444-444444444444',
      archived_at: '2026-01-01T00:00:00Z',
    });
    expect(result).toEqual({ title: 'ЖК Северный', address: 'ул. Лесная, 12' });
    expect('id' in result).toBe(false);
    expect('archived_at' in result).toBe(false);
  });
});
