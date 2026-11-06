/**
 * Обёртка над Data Gateway: same-origin `/api/data/*` → PostgREST (DEC-053).
 *
 * Инварианты:
 *  - токены только в cookies (credentials include), не в заголовке из JS;
 *  - 401 обрабатывает apiFetch (один refresh + retry);
 *  - ошибки наружу без SQL и имён таблиц (INV-007).
 */
import { z } from 'zod';
import { apiFetch } from './http.js';

export class PostgrestApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly serverMessage: string | null;

  constructor(
    message: string,
    status: number,
    code: string | null = null,
    serverMessage: string | null = null,
  ) {
    super(message);
    this.name = 'PostgrestApiError';
    this.status = status;
    this.code = code;
    this.serverMessage = serverMessage;
  }
}

const errorPayloadSchema = z
  .object({
    code: z.string().optional(),
    message: z.string().optional(),
    details: z.string().optional(),
  })
  .partial();

function mapError(status: number, payload: z.infer<typeof errorPayloadSchema>): PostgrestApiError {
  const code = payload.code ?? null;
  const serverMessage = payload.message ?? null;
  if (status === 401) {
    return new PostgrestApiError('Требуется вход', 401, code, serverMessage);
  }
  if (status === 403 || code === '42501') {
    return new PostgrestApiError('Недостаточно прав', 403, code, serverMessage);
  }
  if (status === 404 || status === 406) {
    return new PostgrestApiError('Объект не найден или недоступен', 404, code, serverMessage);
  }
  if (status === 400 || code === 'P0400') {
    return new PostgrestApiError('Проверьте заполнение полей', 400, code, serverMessage);
  }
  return new PostgrestApiError('Не удалось выполнить запрос', status, code, serverMessage);
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  const response = await apiFetch(`/api/data/${path.replace(/^\//, '')}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const text = await response.text();
    let payload: z.infer<typeof errorPayloadSchema> = {};
    if (text) {
      try {
        const parsed = errorPayloadSchema.safeParse(JSON.parse(text));
        if (parsed.success) payload = parsed.data;
      } catch {
        payload = {};
      }
    }
    throw mapError(response.status, payload);
  }
  return response;
}

export async function postgrestJson(path: string, init: RequestInit): Promise<unknown> {
  const response = await request(path, init);
  if (response.status === 204) {
    return null;
  }
  const text = await response.text();
  if (!text) {
    return null;
  }
  const parsed = z.unknown().safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : null;
}

export async function postgrestVoid(path: string, init: RequestInit): Promise<void> {
  await request(path, init);
}
