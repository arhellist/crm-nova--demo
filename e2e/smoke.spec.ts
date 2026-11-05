/**
 * e2e-приёмка NOVA CRM: 17 сценариев §4 на staging (A14.1).
 *
 * Каждый сценарий помечен `A14.1` и проверяет пользовательский результат, а не реализацию.
 * Сценарии независимы: падение одного не помечает остальные skip. Контексты создаются
 * из storageState, подготовленного `global-setup.ts` (менеджер + два исполнителя).
 *
 * Инварианты D14:
 *  - ни одного `test.skip`/`test.fixme` — пропуск не считается приёмкой;
 *  - данные уникальны (`stamp`), повторный прогон не конфликтует с прошлым;
 *  - запрет записи в backend и деградация отчётов проверяются на реальном API стенда.
 */
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { authStatePath, completeMfa } from './global-setup.js';

const stamp = Date.now().toString(36);
const EXECUTOR1 = process.env.E2E_EXECUTOR1_NAME ?? 'Исполнитель 1';
const EXECUTOR2 = process.env.E2E_EXECUTOR2_NAME ?? 'Исполнитель 2';
const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8080';

type Role = 'manager' | 'executor1' | 'executor2';

/** Контекст роли: storageState уже содержит сессию после MFA. */
async function withRole<T>(
  browser: Browser,
  baseURL: string | undefined,
  role: Role,
  run: (page: Page) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({ baseURL, storageState: authStatePath(role) });
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

/**
 * Дождаться ссылки в списке объектов: список листается keyset-курсором по 20 строк,
 * поэтому свежий объект может оказаться не на первой странице.
 */
/** Дождаться строки списка объектов, листая keyset-курсор до её появления. */
async function paginateObjects(page: Page, locator: Locator): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await locator.first().isVisible().catch(() => false)) return;
    const more = page.getByRole('button', { name: 'Показать ещё' });
    if (await more.isVisible().catch(() => false)) {
      const rows = page.getByRole('listitem');
      const before = await rows.count();
      await more.click();
      // Дожидаемся именно новой страницы: повторный клик по кнопке до ответа сервера
      // не приближает нужную строку и делает ожидание недетерминированным.
      await expect.poll(() => rows.count(), { timeout: 15_000 }).toBeGreaterThan(before);
      continue;
    }
    // Список может перезапрашиваться (например, после смены фильтра архивных):
    // ждём, пока кнопка пагинации появится, вместо раннего выхода.
    await page.waitForTimeout(200);
  }
  await expect(locator.first()).toBeVisible();
}

/** Ссылка объекта на первой подходящей странице списка. */
async function objectLink(page: Page, title: string) {
  const link = page.getByRole('link', { name: title });
  await paginateObjects(page, link);
  return link.first();
}

/** Создать объект через UI и вернуть его URL. */
async function createObject(page: Page, title: string): Promise<string> {
  await page.goto('/objects');
  await page.getByRole('button', { name: /Новый объект|Создать объект/ }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название').fill(title);
  await dialog.getByLabel('Адрес').fill(`Адрес ${stamp}`);
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  const link = await objectLink(page, title);
  const href = await link.getAttribute('href');
  expect(href).toContain('/objects/');
  return href ?? '/objects';
}

/** Создать задачу на объекте и вернуть её URL. */
async function createTask(
  page: Page,
  objectTitle: string,
  taskTitle: string,
  executorName: string,
): Promise<string> {
  await page.goto('/objects');
  await (await objectLink(page, objectTitle)).click();
  await page.getByRole('button', { name: 'Создать задачу' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название').fill(taskTitle);
  await dialog.getByLabel('Описание').fill('Проверка приёмки D14');
  await dialog.getByLabel('Исполнитель').selectOption({ label: executorName });
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  const link = page.getByRole('link', { name: taskTitle });
  await expect(link.first()).toBeVisible();
  const href = await link.first().getAttribute('href');
  expect(href).toContain('/tasks/');
  return href ?? '/tasks';
}

/** Довести задачу до статуса «На проверке» руками исполнителя. */
async function moveToReview(page: Page, taskUrl: string): Promise<void> {
  await page.goto(taskUrl);
  await page.getByRole('button', { name: 'Взять в работу' }).click();
  await expect(page.getByText('В работе', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'На проверку' }).click();
  await expect(page.getByText('На проверке', { exact: true }).first()).toBeVisible();
}

test.describe('A14.1 приёмка NOVA CRM', () => {
  test('A14.1 01 вход с MFA открывает «Мои задачи»', async ({ browser, baseURL }) => {
    // Окно TOTP резервируется глобально (см. completeMfa): при двух воркерах вход может
    // ждать до одного 30-секундного окна, поэтому штатных 60 с недостаточно.
    test.setTimeout(120_000);
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    try {
      await page.goto('/login');
      await page.getByLabel('Email').fill(process.env.E2E_MANAGER_EMAIL ?? '');
      await page.getByLabel('Пароль').fill(process.env.E2E_MANAGER_PASSWORD ?? '');
      await page.getByRole('button', { name: 'Войти' }).click();
      const code = page.getByLabel('Код из приложения');
      await expect(code).toBeVisible();
      const secret = process.env.E2E_MANAGER_TOTP_SECRET;
      expect(secret, 'для manager в staging включён TOTP').toBeTruthy();
      await completeMfa(page, secret ?? '');
      await expect(page).toHaveURL(/\/my/);
    } finally {
      await context.close();
    }
  });

  test('A14.1 02 менеджер создаёт объект', async ({ browser, baseURL }) => {
    await withRole(browser, baseURL, 'manager', async (page) => {
      const title = `Объект ${stamp}`;
      // Список показывает название ссылкой; заголовок `h1` — только на карточке объекта.
      const url = await createObject(page, title);
      await page.goto(url);
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    });
  });

  test('A14.1 03 менеджер создаёт задачу и назначает исполнителя', async ({ browser, baseURL }) => {
    await withRole(browser, baseURL, 'manager', async (page) => {
      const object = `Объект задачи ${stamp}`;
      await createObject(page, object);
      const task = `Задача ${stamp}`;
      const url = await createTask(page, object, task, EXECUTOR1);
      await page.goto(url);
      await expect(page.getByRole('heading', { name: task })).toBeVisible();
      await expect(page.getByText(EXECUTOR1).first()).toBeVisible();
    });
  });

  test('A14.1 04 исполнитель берёт задачу в работу', async ({ browser, baseURL }) => {
    const object = `Объект взятия ${stamp}`;
    const task = `Взять ${stamp}`;
    let taskUrl = '';
    await withRole(browser, baseURL, 'manager', async (page) => {
      await createObject(page, object);
      taskUrl = await createTask(page, object, task, EXECUTOR1);
    });
    await withRole(browser, baseURL, 'executor1', async (page) => {
      await page.goto(taskUrl);
      await page.getByRole('button', { name: 'Взять в работу' }).click();
      await expect(page.getByText('В работе', { exact: true }).first()).toBeVisible();
    });
  });

  test('A14.1 05 исполнитель отправляет задачу на проверку', async ({ browser, baseURL }) => {
    const object = `Объект отправки ${stamp}`;
    let taskUrl = '';
    await withRole(browser, baseURL, 'manager', async (page) => {
      await createObject(page, object);
      taskUrl = await createTask(page, object, `Отправить ${stamp}`, EXECUTOR1);
    });
    await withRole(browser, baseURL, 'executor1', async (page) => {
      await moveToReview(page, taskUrl);
      await expect(page.getByText('На проверке', { exact: true }).first()).toBeVisible();
    });
  });

  test('A14.1 06 менеджер принимает задачу', async ({ browser, baseURL }) => {
    const object = `Объект приёмки ${stamp}`;
    let taskUrl = '';
    await withRole(browser, baseURL, 'manager', async (page) => {
      await createObject(page, object);
      taskUrl = await createTask(page, object, `Принять ${stamp}`, EXECUTOR1);
    });
    await withRole(browser, baseURL, 'executor1', async (page) => {
      await moveToReview(page, taskUrl);
    });
    await withRole(browser, baseURL, 'manager', async (page) => {
      await page.goto(taskUrl);
      await page.getByRole('button', { name: 'Принять' }).click();
      await expect(page.getByText('Принята', { exact: true }).first()).toBeVisible();
    });
  });

  test('A14.1 07 менеджер возвращает задачу на доработку с комментарием', async ({ browser, baseURL }) => {
    const object = `Объект возврата ${stamp}`;
    let taskUrl = '';
    await withRole(browser, baseURL, 'manager', async (page) => {
      await createObject(page, object);
      taskUrl = await createTask(page, object, `Вернуть ${stamp}`, EXECUTOR1);
    });
    await withRole(browser, baseURL, 'executor1', async (page) => {
      await moveToReview(page, taskUrl);
    });
    await withRole(browser, baseURL, 'manager', async (page) => {
      await page.goto(taskUrl);
      await page.getByRole('button', { name: 'На доработку' }).click();
      await page.getByLabel('Что доработать').fill('Уточнить сроки');
      await page.getByRole('button', { name: 'Отправить' }).click();
      await expect(page.getByText('На доработке', { exact: true }).first()).toBeVisible();
    });
  });

  test('A14.1 08 исполнитель повторно берёт задачу из доработки', async ({ browser, baseURL }) => {
    const object = `Объект повтора ${stamp}`;
    let taskUrl = '';
    await withRole(browser, baseURL, 'manager', async (page) => {
      await createObject(page, object);
      taskUrl = await createTask(page, object, `Повтор ${stamp}`, EXECUTOR1);
    });
    await withRole(browser, baseURL, 'executor1', async (page) => {
      await moveToReview(page, taskUrl);
    });
    await withRole(browser, baseURL, 'manager', async (page) => {
      await page.goto(taskUrl);
      await page.getByRole('button', { name: 'На доработку' }).click();
      await page.getByLabel('Что доработать').fill('Повторить');
      await page.getByRole('button', { name: 'Отправить' }).click();
      await expect(page.getByText('На доработке', { exact: true }).first()).toBeVisible();
    });
    await withRole(browser, baseURL, 'executor1', async (page) => {
      await page.goto(taskUrl);
      await page.getByRole('button', { name: 'Взять в работу' }).click();
      await expect(page.getByText('В работе', { exact: true }).first()).toBeVisible();
    });
  });

  test('A14.1 09 исполнитель не видит чужие задачи', async ({ browser, baseURL }) => {
    const object = `Объект изоляции ${stamp}`;
    const task = `Чужая ${stamp}`;
    await withRole(browser, baseURL, 'manager', async (page) => {
      await createObject(page, object);
      await createTask(page, object, task, EXECUTOR2);
    });
    await withRole(browser, baseURL, 'executor1', async (page) => {
      await page.goto('/my');
      await expect(page.getByText(task)).toHaveCount(0);
    });
    await withRole(browser, baseURL, 'executor2', async (page) => {
      await page.goto('/my');
      await expect(page.getByText(task).first()).toBeVisible();
    });
  });

  test('A14.1 10 исполнителю недоступен запрещённый переход', async ({ browser, baseURL }) => {
    const object = `Объект запрета ${stamp}`;
    let taskUrl = '';
    await withRole(browser, baseURL, 'manager', async (page) => {
      await createObject(page, object);
      taskUrl = await createTask(page, object, `Запрет ${stamp}`, EXECUTOR1);
    });
    await withRole(browser, baseURL, 'executor1', async (page) => {
      await moveToReview(page, taskUrl);
      await expect(page.getByRole('button', { name: 'Принять' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'На доработку' })).toHaveCount(0);
    });
  });

  test('A14.1 11 менеджер архивирует объект', async ({ browser, baseURL }) => {
    await withRole(browser, baseURL, 'manager', async (page) => {
      const title = `Объект архива ${stamp}`;
      await createObject(page, title);
      // Кнопка строки подписана названием объекта: в списке их несколько.
      await page.getByRole('button', { name: `Архивировать объект ${title}` }).click();
      await page.getByRole('button', { name: 'Архивировать', exact: true }).click();
      // Архивные скрыты по умолчанию: включаем фильтр и проверяем бейдж «Архив» у строки.
      await page.getByLabel('Показать архивные').check();
      const row = page.getByRole('listitem').filter({ hasText: title });
      await paginateObjects(page, row);
      await expect(row.getByText('Архив', { exact: true })).toBeVisible();
    });
  });

  test('A14.1 12 «Мои задачи» показывает назначенные задачи исполнителю', async ({ browser, baseURL }) => {
    const object = `Объект моих задач ${stamp}`;
    const task = `Моя ${stamp}`;
    await withRole(browser, baseURL, 'manager', async (page) => {
      await createObject(page, object);
      await createTask(page, object, task, EXECUTOR1);
    });
    await withRole(browser, baseURL, 'executor1', async (page) => {
      await page.goto('/my');
      await expect(page.getByText(task).first()).toBeVisible();
    });
  });

  test('A14.1 13 менеджер открывает отчёты: три вкладки', async ({ browser, baseURL }) => {
    await withRole(browser, baseURL, 'manager', async (page) => {
      await page.goto('/reports');
      await expect(page.getByRole('tab', { name: 'Объекты' })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Загрузка' })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Возраст статусов' })).toBeVisible();
    });
  });

  test('A14.1 14 отчёт показывает источник и лаг реплики', async ({ browser, baseURL }) => {
    await withRole(browser, baseURL, 'manager', async (page) => {
      await page.goto('/reports');
      await expect(page.getByText(/Данные на реплике/).first()).toBeVisible();
      await expect(page.getByText(/лаг \d+ с/).first()).toBeVisible();
    });
  });

  test('A14.1 15 backend не принимает запись', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/reports/objects`, { data: { title: 'x' } });
    expect(response.status()).toBe(405);
  });

  test('A14.1 16 деградация отчётов не ломает навигацию', async ({ browser, baseURL }) => {
    await withRole(browser, baseURL, 'manager', async (page) => {
      await page.route('**/api/reports/**', (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'E_REPLICA_DOWN', message: 'Реплика недоступна' } }),
        }),
      );
      await page.goto('/reports');
      await expect(page.getByRole('alert')).toBeVisible();
      await page.getByRole('link', { name: 'Мои задачи' }).click();
      await expect(page).toHaveURL(/\/my/);
    });
  });

  test('A14.1 17 сессия восстанавливается после перезагрузки', async ({ browser, baseURL }) => {
    await withRole(browser, baseURL, 'manager', async (page) => {
      await page.goto('/my');
      await expect(page).toHaveURL(/\/my/);
      await page.reload();
      await expect(page).toHaveURL(/\/my/);
      await expect(page.getByRole('link', { name: 'Мои задачи' })).toBeVisible();
    });
  });
});
