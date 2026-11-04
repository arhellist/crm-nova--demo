/**
 * Клиент Supabase Auth/PostgREST для фронтенда NOVA CRM.
 *
 * Зачем модуль: все обращения к Auth и profiles идут через одну границу, где
 *  - конфигурация проверяется Zod, в бандл попадает только `VITE_SUPABASE_ANON_KEY`
 *    (INV-006), `service_role` здесь отсутствует по определению;
 *  - ошибки переводятся в стабильные русские сообщения без токенов и SQL-деталей (INV-007);
 *  - роль приходит из `profiles.role`, а не из claim JWT (INV-005);
 *  - токен живёт в localStorage supabase-js и никогда не пишется в URL и state.
 *
 * Границы: ответ PostgREST валидируется Zod до попадания в состояние компонента.
 */
/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

/** Роль приложения; других значений БД не допускает. */
export const userRoleSchema = z.enum(['manager', 'executor']);
export type UserRole = z.infer<typeof userRoleSchema>;

/** Профиль, который нужен оболочке: имя и роль. Email сюда не входит (INV-011). */
export const profileSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(1).max(120),
  role: userRoleSchema,
});
export type Profile = z.infer<typeof profileSchema>;

const clientEnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
});

function readClientEnv(): { url: string; anonKey: string } {
  const parsed = clientEnvSchema.safeParse(import.meta.env);
  if (!parsed.success) {
    // Значения не печатаем: только имена ключей (INV-007).
    throw new Error('Некорректная конфигурация клиента: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
  }
  return { url: parsed.data.VITE_SUPABASE_URL, anonKey: parsed.data.VITE_SUPABASE_ANON_KEY };
}

interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; full_name: string; role: 'manager' | 'executor' };
        Insert: { id: string; full_name: string; role: 'manager' | 'executor' };
        Update: { full_name?: string; role?: 'manager' | 'executor' };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: { user_role: 'manager' | 'executor' };
    CompositeTypes: Record<string, never>;
  };
}

const { url, anonKey } = readClientEnv();

/** Базовый URL и anon-ключ для PostgREST-обёртки; service_role сюда не попадает (INV-006). */
export const supabaseUrl = url;
export const supabaseAnonKey = anonKey;

/** Единственный экземпляр клиента: сессия и refresh живут в нём. */
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/** Ошибка границы API с HTTP-подобным статусом; текст безопасен для показа. */
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

/** 401/истёкший JWT: повод один раз обновить сессию, а не разлогинивать. */
export function isUnauthorized(error: unknown): error is AuthApiError {
  return error instanceof AuthApiError && error.status === 401;
}

export interface AssuranceLevel {
  currentLevel: string | null;
  nextLevel: string | null;
}

export interface SignInResult {
  mfaRequired: boolean;
}

/** Вход по email и паролю; текст ошибки не раскрывает, существует ли учётная запись. */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new AuthApiError('Неверный email или пароль', 400);
  }

  const factors = await supabase.auth.mfa.listFactors();
  if (factors.error) {
    throw new AuthApiError('Не удалось проверить второй фактор, попробуйте позже', 500);
  }
  const totp = factors.data.totp;
  return { mfaRequired: totp.length > 0 };
}

/** Проверяет 6-значный TOTP-код и повышает сессию до aal2. */
export async function verifyTotp(code: string): Promise<void> {
  const factors = await supabase.auth.mfa.listFactors();
  const factor = factors.data?.totp[0];
  if (factors.error || !factor) {
    throw new AuthApiError('Второй фактор не настроен', 400);
  }

  const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (challenge.error) {
    throw new AuthApiError('Не удалось запросить код, попробуйте позже', 500);
  }

  const verified = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.data.id,
    code,
  });
  if (verified.error) {
    throw new AuthApiError('Неверный код, попробуйте ещё раз', 400);
  }
}

/** Выход с отзывом всех refresh-токенов пользователя. */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  if (error) {
    throw new AuthApiError('Не удалось завершить сеанс', 500);
  }
}

/** Минимум данных сессии, который нужен приложению (без токенов в state). */
export interface CurrentSession {
  user: { id: string; email: string | null };
}

/** Текущая сессия из localStorage; null — пользователь анонимен. */
export async function getSession(): Promise<CurrentSession | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new AuthApiError('Не удалось восстановить сеанс', 500);
  }
  if (!data.session) {
    return null;
  }
  return {
    user: {
      id: data.session.user.id,
      email: data.session.user.email ?? null,
    },
  };
}

/** Текущий и требуемый уровень гарантии: aal2 означает обязательный TOTP. */
export async function getAssurance(): Promise<AssuranceLevel> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) {
    throw new AuthApiError('Не удалось проверить уровень доступа', 500);
  }
  return { currentLevel: data.currentLevel, nextLevel: data.nextLevel };
}

/** Профиль текущего пользователя; 401 помечается статусом для одного refresh в useSession. */
export async function getProfile(): Promise<Profile> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new AuthApiError('Требуется вход', 401);
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', auth.user.id)
    .single();

  if (error) {
    const unauthorized = error.code === 'PGRST301' || error.code === '401';
    throw new AuthApiError(
      unauthorized ? 'Требуется вход' : 'Не удалось загрузить профиль',
      unauthorized ? 401 : 500,
      error.code,
    );
  }

  const parsed = profileSchema.safeParse(data);
  if (!parsed.success) {
    throw new AuthApiError('Не удалось загрузить профиль', 500);
  }
  return parsed.data;
}

/** Обновление access-токена; вызывается ровно один раз при 401. */
export async function refreshSession(): Promise<void> {
  const { error } = await supabase.auth.refreshSession();
  if (error) {
    throw new AuthApiError('Сеанс истёк, войдите заново', 401);
  }
}

/** Подписка на события Auth; возвращает функцию отписки. */
export function onAuthChange(
  handler: (event: string, email: string | null) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    handler(event, session?.user.email ?? null);
  });
  return () => {
    data.subscription.unsubscribe();
  };
}
