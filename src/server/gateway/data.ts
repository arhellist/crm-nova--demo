/**
 * Data Gateway: same-origin прокси на PostgREST при валидной access-cookie (DEC-053).
 *
 * Инварианты:
 *  - без access-cookie запрос к Supabase не уходит (401);
 *  - к складу идёт только пользовательский JWT + anon key, не service_role (INV-001/006);
 *  - небезопасные методы требуют CSRF + Origin.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ACCESS_COOKIE, type CookiePolicy } from '../auth/cookies.js';
import { assertCsrf } from '../auth/csrf.js';

export interface DataGatewayOptions {
  supabaseUrl: string;
  anonKey: string;
  allowedOrigins: readonly string[];
  cookiePolicy: CookiePolicy;
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'cookie',
  'content-length',
]);

function buildUpstreamHeaders(
  request: FastifyRequest,
  accessToken: string,
  anonKey: string,
): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined || HOP_BY_HOP.has(key.toLowerCase())) continue;
    if (key.toLowerCase() === 'authorization') continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  headers.set('apikey', anonKey);
  headers.set('authorization', `Bearer ${accessToken}`);
  // Просим несжатый ответ: fetch всё равно decode'ит, а мы не хотим гонять gzip-заголовки.
  headers.set('accept-encoding', 'identity');
  return headers;
}

export function registerDataGateway(app: FastifyInstance, options: DataGatewayOptions): void {
  const base = options.supabaseUrl.replace(/\/+$/, '');

  app.all('/api/data/*', async (request, reply) => {
    const csrf = assertCsrf(request, options.allowedOrigins);
    if (!csrf.ok) {
      return reply.status(csrf.status).send({
        error: { code: 'E_CSRF', message: csrf.message },
      });
    }

    const access = request.cookies[ACCESS_COOKIE];
    if (!access) {
      return reply.status(401).send({
        error: { code: 'E_UNAUTHORIZED', message: 'Требуется вход' },
      });
    }

    // `/api/data/objects?...` → `/rest/v1/objects?...`
    const prefix = '/api/data';
    const restPath = request.url.slice(prefix.length) || '/';
    const upstreamUrl = `${base}/rest/v1${restPath.startsWith('/') ? restPath : `/${restPath}`}`;

    const init: RequestInit = {
      method: request.method,
      headers: buildUpstreamHeaders(request, access, options.anonKey),
      redirect: 'manual',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.body !== undefined) {
      init.body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      if (!headersHas(init.headers as Headers, 'content-type')) {
        (init.headers as Headers).set('content-type', 'application/json');
      }
    }

    let upstream: Response;
    try {
      upstream = await fetch(upstreamUrl, init);
    } catch {
      return reply.status(502).send({
        error: { code: 'E_UPSTREAM', message: 'Склад данных временно недоступен' },
      });
    }

    return pipeUpstream(reply, upstream);
  });
}

function headersHas(headers: Headers, name: string): boolean {
  return headers.has(name);
}

async function pipeUpstream(reply: FastifyReply, upstream: Response): Promise<void> {
  void reply.status(upstream.status);
  // undici/fetch уже распаковывает тело: проброс Content-Encoding: gzip даёт
  // ERR_CONTENT_DECODING_FAILED в браузере (двойная «распаковка»).
  const hop = new Set([
    'transfer-encoding',
    'connection',
    'content-encoding',
    'content-length',
    'set-cookie',
  ]);
  upstream.headers.forEach((value, key) => {
    if (hop.has(key.toLowerCase())) return;
    void reply.header(key, value);
  });
  const buf = Buffer.from(await upstream.arrayBuffer());
  void reply.header('content-length', String(buf.length));
  await reply.send(buf.length > 0 ? buf : null);
}
