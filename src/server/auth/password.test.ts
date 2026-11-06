import { describe, expect, it } from 'vitest';
import { generateManagerPassword } from './password.js';

describe('generateManagerPassword DEC-060', () => {
  it('возвращает пароль длины 20 из безопасного алфавита', () => {
    const password = generateManagerPassword();
    expect(password).toHaveLength(20);
    expect(password).toMatch(/^[A-Za-z2-9!@$%]+$/);
    expect(password).not.toMatch(/[0O1Il]/);
  });

  it('два вызова дают разные значения', () => {
    const a = generateManagerPassword();
    const b = generateManagerPassword();
    expect(a).not.toBe(b);
  });
});
