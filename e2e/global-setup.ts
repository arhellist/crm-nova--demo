/**
 * Глобальная подготовка e2e: вход трёх учётных записей и сохранение storageState.
 *
 * Зачем отдельный setup: сценарии приёмки не должны логиниться каждый раз заново —
 * это замедляет прогон и делает падение входа неотличимым от падения сценария.
 * Здесь один раз выполняется полный вход (email + пароль + TOTP для менеджера),
 * результат складывается в каталог `E2E_AUTH_DIR` (по умолчанию временный, не в git).
 *
 * Инварианты:
 *  - пароли и TOTP-секреты приходят только из env и не печатаются в лог;
 *  - отсутствие учётной записи — падение setup, а не молчаливый skip (инвариант 2 D14);
 *  - storageState не попадает в репозиторий: каталог по умолчанию в os.tmpdir().
 */
import { chromium, type FullConfig, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

interface Account {
  name: 'manager' | 'executor1' | 'executor2';
  email: string;
  password: string;
  totpSecret: string | null;
}

const AUTH_DIR = process.env.E2E_AUTH_DIR ?? path.join(os.tmpdir(), 'nova-e2e-auth');

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная окружения ${name}: e2e без неё не воспроизводим`);
  return value;
}

function optional(name: string): string | null {
  const value = process.env[name];
  return value ? value : null;
}

/** Три учётные записи стенда: 1 менеджер и 2 исполнителя (инвариант 9 D14). */
function accounts(): Account[] {
  return [
    {
      name: 'manager',
      email: required('E2E_MANAGER_EMAIL'),
      password: required('E2E_MANAGER_PASSWORD'),
      totpSecret: optional('E2E_MANAGER_TOTP_SECRET'),
    },
    {
      name: 'executor1',
      email: required('E2E_EXECUTOR1_EMAIL'),
      password: required('E2E_EXECUTOR1_PASSWORD'),
      totpSecret: optional('E2E_EXECUTOR1_TOTP_SECRET'),
    },
    {
      name: 'executor2',
      email: required('E2E_EXECUTOR2_EMAIL'),
      password: required('E2E_EXECUTOR2_PASSWORD'),
      totpSecret: optional('E2E_EXECUTOR2_TOTP_SECRET'),
    },
  ];
}

/** Base32 без зависимостей: секреты TOTP в env чаще всего в этом алфавите. */
function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error('TOTP-секрет содержит символ вне base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 6238: 6 цифр, SHA-1, шаг 30 секунд — параметры Supabase Auth по умолчанию. */
export function totp(secret: string, atMs = Date.now()): string {
  const counter = Math.floor(atMs / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

async function login(page: Page, baseURL: string, account: Account): Promise<void> {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Пароль').fill(account.password);
  await page.getByRole('button', { name: 'Войти' }).click();

  const codeField = page.getByLabel('Код из приложения');
  if (await codeField.isVisible().catch(() => false)) {
    if (!account.totpSecret) {
      throw new Error(`Учётной записи ${account.name} требуется TOTP, но секрет не задан`);
    }
    await codeField.fill(totp(account.totpSecret));
    await page.getByRole('button', { name: 'Подтвердить' }).click();
  }

  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

/**
 * Playwright вызывает setup до проектов. Возвращаемое значение игнорируется:
 * побочный эффект — файлы storageState, которые spec читает по имени роли.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL ?? process.env.E2E_BASE_URL;
  if (!baseURL) throw new Error('Не задан E2E_BASE_URL: e2e запускается только на стенде');
  await mkdir(AUTH_DIR, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const account of accounts()) {
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      await login(page, String(baseURL), account);
      await context.storageState({ path: authStatePath(account.name) });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

/** Путь storageState роли — единая точка для setup и spec. */
export function authStatePath(name: Account['name']): string {
  return path.join(AUTH_DIR, `${name}.json`);
}

/** Сохранить произвольное состояние (используется тестами восстановления сессии). */
export async function saveState(name: string, state: unknown): Promise<void> {
  await writeFile(path.join(AUTH_DIR, `${name}.json`), JSON.stringify(state), 'utf8');
}
