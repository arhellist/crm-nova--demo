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
import { mkdir, open, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
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

/**
 * Зарезервировать 30-секундное окно TOTP, свободное от других входов.
 *
 * Supabase отклоняет повторное использование одного кода, а приёмка логинит менеджера
 * трижды (setup + desktop + mobile) — иногда одновременно в двух воркерах. Поэтому
 * окна раздаются через файловый семафор: каждый вход получает окно строго больше
 * предыдущего, даже если процессы стартовали в одну секунду. Иначе второй вход
 * падал бы на «код уже использован» и setup сохранял пустую сессию.
 */
async function reserveTotpWindow(): Promise<number> {
  const lockPath = path.join(os.tmpdir(), 'nova-e2e-totp.lock');
  const statePath = path.join(os.tmpdir(), 'nova-e2e-totp.window');
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    let handle;
    try {
      handle = await open(lockPath, 'wx');
    } catch {
      // Процесс мог умереть с захваченным семафором: замок старше 15 секунд не живой.
      const age = await stat(lockPath).then((info) => Date.now() - info.mtimeMs).catch(() => 0);
      if (age > 15_000) await unlink(lockPath).catch(() => undefined);
      await delay(250);
      continue;
    }
    try {
      const lastRaw = await readFile(statePath, 'utf8').catch(() => '0');
      const last = Number.parseInt(lastRaw, 10);
      const current = Math.floor(Date.now() / 30_000);
      const reserved = Math.max(current, Number.isFinite(last) ? last + 1 : current);
      await writeFile(statePath, String(reserved), 'utf8');
      return reserved;
    } finally {
      await handle.close();
      await unlink(lockPath).catch(() => undefined);
    }
  }
  throw new Error('Не удалось зарезервировать окно TOTP за 120 секунд');
}

/**
 * Подтвердить TOTP в зарезервированном окне.
 *
 * Если сервер отклонил код (например, часы стенда ушли вперёд), резервируется следующее
 * окно и попытка повторяется: код никогда не переиспользуется.
 */
export async function completeMfa(page: Page, secret: string): Promise<void> {
  const codeField = page.getByLabel('Код из приложения');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const window = await reserveTotpWindow();
    const startsAt = window * 30_000;
    const waitMs = startsAt + 500 - Date.now();
    if (waitMs > 0) await page.waitForTimeout(waitMs);
    await codeField.fill(totp(secret, startsAt + 1_000));
    await page.getByRole('button', { name: 'Подтвердить' }).click();
    const accepted = await page
      .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (accepted) {
      return;
    }
  }
  throw new Error('TOTP не принят после повтора на следующем окне');
}

async function login(page: Page, baseURL: string, account: Account): Promise<void> {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Пароль').fill(account.password);
  await page.getByRole('button', { name: 'Войти' }).click();

  // Гонка «MFA или уже вошли»: после пароля приложение может показать второй фактор
  // с задержкой (сеть + рендер), а может сразу перейти на рабочий экран. Оба ожидания
  // завершаются ошибкой по таймауту — раньше она молча превращалась в «уже вошли»,
  // и setup сохранял пустой storageState, а падал уже сценарий (DEC-037).
  const codeField = page.getByLabel('Код из приложения');
  const step = await Promise.race([
    page
      .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
      .then(() => 'app' as const),
    codeField.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'mfa' as const),
  ]).catch(async () => {
    const alert = await page.getByRole('alert').first().textContent().catch(() => null);
    throw new Error(
      `Вход ${account.name} не завершился: ${alert?.trim() || 'ни MFA, ни переход в приложение'}`,
    );
  });

  if (step === 'mfa') {
    if (!account.totpSecret) {
      throw new Error(`Учётной записи ${account.name} требуется TOTP, но секрет не задан`);
    }
    await completeMfa(page, account.totpSecret);
  }
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
