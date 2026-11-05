/**
 * serve-preview.mjs — локальный staging-хост production-сборки SPA.
 *
 * Зачем: приёмка (A14.1, A14.2) обязана идти на production-сборке и на тех же
 * security-заголовках, что отдаёт Vercel. `vite preview` заголовки из `vercel.json`
 * не применяет, поэтому staging поднимается этим скриптом: он читает `vercel.json`
 * как единственный источник заголовков и раздаёт `dist/web` с SPA-fallback.
 *
 * Отличие staging от production ровно одно и явное: `STAGING_CONNECT_SRC` добавляет
 * origin'ы локального Supabase и отчётного API в `connect-src`. Все остальные директивы
 * (отсутствие `unsafe-eval`, `frame-ancestors 'none'`, `script-src 'self'`) не меняются.
 *
 * Использование:
 *   STAGING_CONNECT_SRC="http://127.0.0.1:54321 http://127.0.0.1:8080" \
 *   PORT=4173 node scripts/release/serve-preview.mjs
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(ROOT, 'dist', 'web');
const PORT = Number(process.env.PORT ?? 4173);
const HOST = process.env.HOST ?? '127.0.0.1';
const EXTRA_CONNECT = (process.env.STAGING_CONNECT_SRC ?? '')
  .split(/\s+/)
  .map((value) => value.trim())
  .filter(Boolean);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

/** Заголовки из vercel.json: источник — конфигурация production-хоста, не копия в коде. */
function loadHeaders() {
  const config = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const headers = new Map();
  for (const block of config.headers ?? []) {
    for (const header of block.headers ?? []) {
      headers.set(header.key, String(header.value));
    }
  }
  const csp = headers.get('Content-Security-Policy');
  if (!csp) throw new Error('vercel.json: отсутствует Content-Security-Policy — приёмка без CSP невозможна');
  if (EXTRA_CONNECT.length > 0) {
    // Продление `connect-src` только для staging: список origin'ов приходит из env,
    // в репозитории локальных адресов нет.
    headers.set(
      'Content-Security-Policy',
      csp.replace(/connect-src[^;]*/, `connect-src 'self' ${EXTRA_CONNECT.join(' ')} https://*.supabase.co`),
    );
  }
  return headers;
}

const HEADERS = loadHeaders();

/** Файл внутри dist/web или SPA-fallback на index.html. */
function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const candidate = path.join(DIST, path.normalize(clean).replace(/^(\.\.[/\\])+/, ''));
  if (candidate.startsWith(DIST) && existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }
  return path.join(DIST, 'index.html');
}

if (!existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/web/index.html не найден: сначала npm run build:web');
  process.exit(1);
}

const server = http.createServer((request, response) => {
  const file = resolveFile(request.url ?? '/');
  for (const [key, value] of HEADERS) response.setHeader(key, value);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
  response.setHeader('Cache-Control', file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable');
  response.statusCode = 200;
  createReadStream(file).pipe(response);
});

server.listen(PORT, HOST, () => {
  console.log(`staging: http://${HOST}:${PORT} (dist/web, заголовки из vercel.json)`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
