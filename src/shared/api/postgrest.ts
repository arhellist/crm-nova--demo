/**
 * Обёртка над PostgREST: единственная точка HTTP-записи объектов.
 *
 * Почему модуль:
 *  - базовый URL и anon-ключ берутся из проверенной клиентской конфигурации (INV-006);
 *  - `Authorization` — access-токен текущей сессии supabase-js, токен не логируется
 *    и не попадает в URL (INV-007);
 *  - ошибки PostgREST переводятся в доменные сообщения: SQL, имя таблицы и факт
 *    существования чужой строки наружу не отдаются;
 *  - JSON-ответ валидируется вызывающим кодом Zod; здесь только безопасный разбор.
 */
import { z } from 'zod';
import { supabase, supabaseAnonKey, supabaseUrl } from '../../features/auth/api.js';

/** Доменная ошибка границы; `status` повторяет HTTP, `code` — PostgREST/PostgreSQL. */
export class PostgrestApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = 'PostgrestApiError';
    this.status = status;
    this.code = code;
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
  if (status === 401) {
    return new PostgrestApiError('Требуется вход', 401, code);
  }
  if (status === 403 || code === '42501') {
    return new PostgrestApiError('Недостаточно прав', 403, code);
  }
  if (status === 404 || status === 406) {
    return new PostgrestApiError('Объект не найден или недоступен', 404, code);
  }
  if (status === 400 || code === 'P0400') {
    return new PostgrestApiError('Проверьте заполнение полей', 400, code);
  }
  return new PostgrestApiError('Не удалось выполнить запрос', status, code);
}

async function buildHeaders(extra?: HeadersInit): Promise<Headers> {
  const headers = new Headers(extra);
  headers.set('apikey', supabaseAnonKey);
  headers.set('Accept', 'application/json');

  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    headers.set('Authorization', `Bearer ${data.session.access_token}`);
  }
  return headers;
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const headers = await buildHeaders(init.headers);
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers });
  if (!response.ok) {
    const text = await response.text();
    const parsed = text ? errorPayloadSchema.safeParse(JSON.parse(text)) : null;
    throw mapError(response.status, parsed?.success ? parsed.data : {});
  }
  return response;
}

/** Выполняет запрос и возвращает разобранный JSON (или null для пустого тела). */
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

/** Запрос без тела ответа: RPC архивирования отвечает 204. */
export async function postgrestVoid(path: string, init: RequestInit): Promise<void> {
  await request(path, init);
}
