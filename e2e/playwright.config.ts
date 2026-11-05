/**
 * Конфигурация e2e NOVA CRM: приёмка идёт на staging, а не на dev-сервере.
 *
 * Инварианты D14:
 *  - baseURL берётся из E2E_BASE_URL; без стенда прогон не стартует;
 *  - `retries: 1` включается только в CI и не скрывает падение: отчёт содержит обе попытки;
 *  - trace пишется при первом повторе, чтобы разбирать флаки без воспроизведения вручную;
 *  - два проекта — desktop 1440 и mobile 360: вёрстка приёмки проверяется в обеих ширинах;
 *  - глобальный setup логинит менеджера и двух исполнителей (storageState).
 */
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: '.',
  testMatch: 'smoke.spec.ts',
  globalSetup: './global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: isCI ? 1 : 0,
  // Два воркера на любом стенде: больше — риск нехватки памяти у chromium и гонок
  // на общих учётных записях, меньше — приёмка Desktop+Mobile идёт слишком долго.
  workers: Number(process.env.E2E_WORKERS ?? 2),
  forbidOnly: isCI,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
  },
  projects: [
    {
      name: 'desktop-1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-360',
      // Mobile идёт после desktop: приёмка входа с MFA использует единственную учётную
      // запись менеджера, а Supabase принимает каждый TOTP-код только один раз за окно.
      // Параллельные проекты соревновались за окно и делали вход недетерминированным.
      dependencies: ['desktop-1440'],
      use: { ...devices['Pixel 5'], viewport: { width: 360, height: 800 } },
    },
  ],
});
