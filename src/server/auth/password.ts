/**
 * Генерация одноразового пароля для провижининга менеджера (DEC-060).
 *
 * Пароль не логируется: вызывающий код обязан не писать его в pino/метрики.
 */
import { randomBytes } from 'node:crypto';

/** Алфавит без неоднозначных символов (0/O, 1/l/I). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%';

/** Длина пароля: 20 символов из ~70 → достаточная энтропия для демо-учётки. */
const PASSWORD_LENGTH = 20;

export function generateManagerPassword(): string {
  const bytes = randomBytes(PASSWORD_LENGTH);
  let out = '';
  for (let i = 0; i < PASSWORD_LENGTH; i += 1) {
    out += ALPHABET[bytes[i]! % ALPHABET.length]!;
  }
  return out;
}
