/**
 * Тесты контура реплики: идемпотентный compose, подписка и отчётные вьюхи без ПДн.
 *
 * @acceptance A10.1
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

function read(relative) {
  return readFileSync(join(here, relative), 'utf8');
}

const compose = read('docker-compose.yml');
const subscription = read('init/010_subscription.sql');
const views = read('init/020_views.sql');
const stub = read('init/000_auth_stub.sql');
const dockerfile = read('api.Dockerfile');

describe('A10.1 контур реплики', () => {
  it('A10.1 поднимает PostgreSQL 16 с healthcheck и хранит данные в volume', () => {
    expect(compose).toContain('image: postgres:16');
    expect(compose).toContain('pg_isready');
    expect(compose).toContain('replica-data:/var/lib/postgresql/data');
    expect(compose).toContain('max_replication_slots=4');
  });

  it('init выполняется только после healthy реплики, api — после init', () => {
    expect(compose).toContain('condition: service_healthy');
    expect(compose).toContain('condition: service_completed_successfully');
    expect(compose).toContain('000_auth_stub.sql');
    expect(compose).toContain('/opt/nova/migrations/0001_*.sql');
    expect(compose).toContain('/opt/nova/migrations/0007_*.sql');
  });

  it('api знает только строку подключения к реплике и не получает primary', () => {
    const apiBlock = compose.slice(compose.indexOf('  api:'));
    expect(apiBlock).toContain('DATABASE_URL_REPLICA');
    expect(apiBlock).toContain('DATABASE_URL:');
    expect(apiBlock).not.toContain('PRIMARY_DATABASE_URL');
    expect(apiBlock).not.toContain('service_role');
  });

  it('сборка образа не работает от root и проверяет /health', () => {
    expect(dockerfile).toContain('FROM node:20-alpine');
    expect(dockerfile).toContain('USER node');
    expect(dockerfile).toContain('npm ci --omit=dev');
    expect(dockerfile).toContain('/health');
  });

  it('повторный запуск не дублирует данные: подписка создаётся только при отсутствии', () => {
    expect(subscription).toContain('create subscription nova_sub');
    expect(subscription).toContain('copy_data = true');
    expect(subscription).toContain('create_slot = true');
    expect(subscription).toContain("where not exists (select 1 from pg_subscription where subname = 'nova_sub')");
    expect(stub).toContain('create schema if not exists auth');
    expect(stub).toContain('create table if not exists auth.users');
  });

  it('пароли и conninfo не записаны в файлы', () => {
    for (const source of [compose, subscription, views, dockerfile]) {
      expect(source).not.toMatch(/password\s*=\s*['"]?[a-z0-9]/i);
      expect(source).not.toMatch(/postgres:\/\/nova_ro:(?!\$)/);
    }
    expect(subscription).toContain(":'replicator_conninfo'");
  });
});

describe('A10.1 отчётные вьюхи', () => {
  it('создаёт три вьюхи и выдаёт nova_ro только select', () => {
    expect(views).toContain('create or replace view public.report_objects');
    expect(views).toContain('create or replace view public.report_workload');
    expect(views).toContain('create or replace view public.report_status_ages');
    expect(views).toContain('revoke all on all tables in schema public from nova_ro');
    expect(views).toContain('grant select on table public.report_objects');
    expect(views).not.toMatch(/grant\s+(insert|update|delete)/i);
  });

  it('вьюхи не выгружают email, description и комментарии истории', () => {
    // SQL вьюх без комментариев-пояснений: в тексте `comment on view` слово email допустимо,
    // запрещён именно столбец в выборке.
    const sql = views
      .split('\n')
      .filter(
        (line) =>
          !line.trimStart().startsWith('--') && !line.trimStart().startsWith('comment on'),
      )
      .join('\n');
    const selectBlocks = sql.slice(sql.indexOf('create or replace view'), sql.indexOf('revoke all'));
    expect(selectBlocks).not.toContain('email');
    expect(selectBlocks).not.toContain('description');
    expect(selectBlocks).not.toContain('h.comment');
    expect(selectBlocks).toContain('p.full_name');
  });
});
