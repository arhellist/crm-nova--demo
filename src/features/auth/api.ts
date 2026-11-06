/**
 * Клиент Auth BFF: вход/выход/профиль через same-origin cookies (DEC-053).
 *
 * Инварианты:
 *  - access/refresh не читаются из JS и не кладутся в localStorage;
 *  - роль — только из `profiles` через `/api/auth/me` (INV-005);
 *  - в бандл не попадает service_role; прямой Supabase Auth с клиента не используется.
 */
import { z } from 'zod';
import { apiFetch, type HttpError } from '../../shared/api/http.js';

export const userRoleSchema = z.enum(['manager', 'executor']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const profileSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(1).max(120),
  role: userRoleSchema,
});
export type Profile = z.infer<typeof profileSchema>;

export class AuthApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status = 400, code: string | null = null) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
    this.code = code;
  }
}

export function isUnauthorized(error: unknown): error is AuthApiError {
  return error instanceof AuthApiError && error.status === 401;
}

export interface SignInResult {
  mfaRequired: false;
}

export interface SessionUser {
  id: string;
  email: string | null;
}

/** Вход email/пароль без TOTP; сессия только в httpOnly cookies. */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  return signInWithPassword(email, password);
}

export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  const response = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new AuthApiError('Неверный email или пароль', 401, 'E_UNAUTHORIZED');
  }
  return { mfaRequired: false };
}

/** Выход: revoke на GoTrue + очистка cookies. */
export async function signOut(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' });
}

const createdManagerSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1).max(120),
  password: z.string().min(8),
});

export type CreatedManager = z.infer<typeof createdManagerSchema>;

/**
 * Создание менеджера постановщиком (DEC-060).
 * Пароль приходит один раз в ответе — клиент не должен логировать его.
 */
export async function createManager(input: {
  email: string;
  full_name: string;
}): Promise<CreatedManager> {
  const response = await apiFetch('/api/auth/managers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (response.status === 403) {
    throw new AuthApiError('Недостаточно прав', 403, 'E_FORBIDDEN');
  }
  if (response.status === 503) {
    throw new AuthApiError('Создание менеджеров временно недоступно', 503, 'E_PROVISIONING_UNAVAILABLE');
  }
  if (!response.ok) {
    let message = 'Не удалось создать учётную запись';
    try {
      const body = z
        .object({ error: z.object({ message: z.string() }).optional() })
        .safeParse(await response.json());
      if (body.success && body.data.error?.message) {
        message = body.data.error.message;
      }
    } catch {
      void response.status;
    }
    throw new AuthApiError(message, response.status, 'E_PROVISIONING');
  }
  return createdManagerSchema.parse(await response.json());
}

/** Текущая сессия: есть профиль → пользователь; 401 → аноним. */
export async function getSession(): Promise<{ user: SessionUser } | null> {
  const response = await apiFetch('/api/auth/me');
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new AuthApiError('Не удалось проверить сессию', response.status);
  }
  const body = z
    .object({
      profile: profileSchema,
      email: z.string().email().nullable().optional(),
    })
    .parse(await response.json());
  return {
    user: {
      id: body.profile.id,
      email: body.email ?? null,
    },
  };
}

/** Профиль текущего пользователя. */
export async function getProfile(): Promise<Profile> {
  const response = await apiFetch('/api/auth/me');
  if (response.status === 401) {
    throw new AuthApiError('Требуется вход', 401, 'E_UNAUTHORIZED');
  }
  if (!response.ok) {
    throw new AuthApiError('Не удалось загрузить профиль', response.status);
  }
  const body = z
    .object({
      profile: profileSchema,
    })
    .parse(await response.json());
  return body.profile;
}

/** Совместимость: MFA снята — assurance всегда «достаточный». */
export function getAssurance(): Promise<{ currentLevel: string; nextLevel: string | null }> {
  return Promise.resolve({ currentLevel: 'aal1', nextLevel: null });
}

/** @deprecated MFA снята (DEC-053); оставлено чтобы старые импорты не ломали сборку тестов. */
export function verifyTotp(_code: string): Promise<void> {
  return Promise.reject(new AuthApiError('Двухфакторная аутентификация отключена', 400));
}

/** Один refresh через BFF (используется interceptor'ом и тестами). */
export async function refreshSession(): Promise<void> {
  const response = await apiFetch('/api/auth/refresh', { method: 'POST' });
  if (!response.ok) {
    throw new AuthApiError('Сессия истекла, войдите снова', 401);
  }
}

type AuthChangeHandler = (event: string, email: string | null) => void;

/** Подписка на видимость вкладки: при focus перечитываем сессию снаружи. */
export function onAuthChange(handler: AuthChangeHandler): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  const onFocus = (): void => {
    handler('TOKEN_REFRESHED', null);
  };
  window.addEventListener('focus', onFocus);
  return () => window.removeEventListener('focus', onFocus);
}

/** Заглушка: supabase-js на клиенте больше не используется для данных. */
export const supabase = {
  auth: {
    getSession: (): Promise<{ data: { session: null }; error: null }> =>
      Promise.resolve({ data: { session: null }, error: null }),
  },
};

export const supabaseUrl = '';
export const supabaseAnonKey = '';

export type { HttpError };
