/**
 * GoTrue Admin + PostgREST insert профиля под service_role (DEC-060).
 *
 * Инварианты:
 *  - ключ только здесь и только для создания manager; Data Gateway его не видит;
 *  - пароль в логи не попадает;
 *  - роль профиля всегда `manager` — executor этим модулем не создаётся.
 */
import { z } from 'zod';

const createdUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable().optional(),
});

export class AdminProvisioningError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'AdminProvisioningError';
    this.status = status;
    this.code = code;
  }
}

export interface AdminClient {
  createManager(input: {
    email: string;
    password: string;
    fullName: string;
  }): Promise<{ id: string; email: string }>;
}

export function createAdminClient(
  supabaseUrl: string,
  serviceRoleKey: string,
): AdminClient {
  const base = supabaseUrl.replace(/\/+$/, '');

  return {
    async createManager({ email, password, fullName }) {
      const createResponse = await fetch(`${base}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        }),
      });

      const createText = await createResponse.text();
      if (!createResponse.ok) {
        // Не раскрываем, занят ли email: единый текст для 4xx.
        if (createResponse.status === 422 || createResponse.status === 400) {
          throw new AdminProvisioningError(
            'Не удалось создать учётную запись. Проверьте email.',
            400,
            'E_VALIDATION',
          );
        }
        throw new AdminProvisioningError(
          'Не удалось создать учётную запись',
          502,
          'E_UPSTREAM',
        );
      }

      let createJson: unknown = {};
      try {
        createJson = createText ? z.unknown().parse(JSON.parse(createText)) : {};
      } catch {
        throw new AdminProvisioningError(
          'Не удалось создать учётную запись',
          502,
          'E_UPSTREAM',
        );
      }

      const user = createdUserSchema.safeParse(createJson);
      if (!user.success) {
        throw new AdminProvisioningError(
          'Не удалось создать учётную запись',
          502,
          'E_UPSTREAM',
        );
      }

      const profileResponse = await fetch(`${base}/rest/v1/profiles`, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
          prefer: 'return=minimal',
        },
        body: JSON.stringify({
          id: user.data.id,
          full_name: fullName,
          role: 'manager',
        }),
      });

      if (!profileResponse.ok) {
        // Auth-пользователь уже есть — откат через Admin delete, чтобы не оставлять «сироту».
        await fetch(`${base}/auth/v1/admin/users/${user.data.id}`, {
          method: 'DELETE',
          headers: {
            apikey: serviceRoleKey,
            authorization: `Bearer ${serviceRoleKey}`,
          },
        }).catch(() => undefined);
        throw new AdminProvisioningError(
          'Не удалось создать профиль менеджера',
          502,
          'E_UPSTREAM',
        );
      }

      return { id: user.data.id, email: user.data.email ?? email };
    },
  };
}
