/**
 * Сборка и предпросмотр SPA NOVA CRM.
 *
 * Зачем отдельный конфиг: без него `vite build` кладёт файлы в `dist/`, а это каталог
 * backend-сборки (`tsc` → `dist/server`). Смешение двух артефактов ломает и релиз, и
 * проверку секретов: `check-no-secrets.sh` сканирует `dist/`, и в него попадали бы оба.
 * Сборка фронтенда идёт в `dist/web` — ровно этот каталог забирает Vercel (vercel.json).
 *
 * Инварианты:
 *  - sourcemap в production не пишется: карты раскрывают структуру кода;
 *  - `import.meta.env` берётся из окружения сборки, секретов там нет (только публичные
 *    VITE_SUPABASE_ANON_KEY и read-only токен отчётов, DEC-025);
 *  - предпросмотр не является транспортом: security-заголовки выдаёт хост (vercel.json).
 */
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    sourcemap: false,
    // Бандл >500 кБ не ошибка: React + TanStack Query укладываются в один чанк,
    // разделение по маршрутам не требуется для закрытой CRM.
    chunkSizeWarningLimit: 900,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  server: {
    port: 5173,
  },
});
