/**
 * Server-side клиент GoTrue (Supabase Auth).
 *
 * BFF единственный, кто видит access/refresh; браузер получает только Set-Cookie.
 * Admin (`service_role`) — отдельно в `admin.ts` только для POST /api/auth/managers (DEC-060).
 */
import { z } from 'zod';

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().optional(),
  token_type: z.string().optional(),
  user: z
    .object({
      id: z.string().uuid(),
      email: z.string().email().nullable().optional(),
    })
    .optional(),
});

export type GoTrueTokens = z.infer<typeof tokenResponseSchema>;

const userResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable().optional(),
});

export type GoTrueUser = z.infer<typeof userResponseSchema>;

export class GoTrueError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GoTrueError';
    this.status = status;
  }
}

export interface GoTrueClient {
  signInWithPassword(email: string, password: string): Promise<GoTrueTokens>;
  refresh(refreshToken: string): Promise<GoTrueTokens>;
  getUser(accessToken: string): Promise<GoTrueUser>;
  signOut(accessToken: string): Promise<void>;
}

export function createGoTrueClient(supabaseUrl: string, anonKey: string): GoTrueClient {
  const base = supabaseUrl.replace(/\/+$/, '');

  async function postJson(path: string, body: Record<string, string>, accessToken?: string): Promise<GoTrueTokens> {
    const headers: Record<string, string> = {
      apikey: anonKey,
      'content-type': 'application/json',
      accept: 'application/json',
    };
    if (accessToken) {
      headers.authorization = `Bearer ${accessToken}`;
    }
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      // Единый текст наружу: без user enumeration и без сырого тела GoTrue.
      throw new GoTrueError('Неверный email или пароль', response.status === 400 ? 401 : response.status);
    }
    let json: unknown = {};
    try {
      json = text ? z.unknown().parse(JSON.parse(text)) : {};
    } catch {
      throw new GoTrueError('Сервис входа временно недоступен', 502);
    }
    const parsed = tokenResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new GoTrueError('Сервис входа вернул некорректный ответ', 502);
    }
    return parsed.data;
  }

  return {
    async signInWithPassword(email, password) {
      return postJson('/auth/v1/token?grant_type=password', { email, password });
    },

    async refresh(refreshToken) {
      try {
        return await postJson('/auth/v1/token?grant_type=refresh_token', {
          refresh_token: refreshToken,
        });
      } catch (error) {
        if (error instanceof GoTrueError) {
          throw new GoTrueError('Сессия истекла, войдите снова', 401);
        }
        throw error;
      }
    },

    async getUser(accessToken) {
      const response = await fetch(`${base}/auth/v1/user`, {
        method: 'GET',
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
        },
      });
      if (response.status === 401) {
        throw new GoTrueError('Требуется вход', 401);
      }
      if (!response.ok) {
        throw new GoTrueError('Не удалось проверить сессию', 502);
      }
      const parsed = userResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new GoTrueError('Сервис входа вернул некорректный ответ', 502);
      }
      return parsed.data;
    },

    async signOut(accessToken) {
      const response = await fetch(`${base}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${accessToken}`,
        },
      });
      // Ошибку logout не эскалируем: cookies всё равно очищаем на BFF.
      if (!response.ok && response.status !== 401) {
        return;
      }
    },
  };
}
