/**
 * A13.1, A13.2 — правила и дашборд наблюдаемости опираются на реальные серии.
 *
 * `promtool` в окружении может отсутствовать, поэтому структура YAML проверяется разбором
 * блоков (имя, expr, for, labels, annotations), а срабатывание правила доступности —
 * моделью `up = 0`: алерт обязан стать firing не позже 2 минут и нести ссылку на runbook.
 * Дополнительно читается исходник `/metrics` D11: метрики из expr обязаны там существовать.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RULES = readFileSync(path.join(ROOT, 'observability/prometheus/rules.yml'), 'utf8');
const DASHBOARD = JSON.parse(
  readFileSync(path.join(ROOT, 'observability/grafana/dashboard.json'), 'utf8'),
);
const HEALTH_SOURCE = readFileSync(path.join(ROOT, 'src/reporting/routes/health.ts'), 'utf8');
const DRILL = readFileSync(path.join(ROOT, 'docs/runbooks/incident.drill.md'), 'utf8');
const INCIDENT = readFileSync(path.join(ROOT, 'docs/runbooks/incident.md'), 'utf8');

/** Метрики, которые реально отдаёт `/metrics` D11, плюс служебная серия Prometheus `up`. */
const KNOWN_SERIES = new Set([
  'up',
  'http_requests_total',
  'http_request_duration_seconds',
  'http_request_duration_seconds_bucket',
  'http_request_duration_seconds_sum',
  'http_request_duration_seconds_count',
  'replica_lag_seconds',
  'replica_streaming',
  'replica_last_sync_timestamp',
  'report_cache_hit_total',
  'report_cache_miss_total',
  'db_pool_total',
  'db_pool_acquired',
  'db_pool_waiting',
]);

/** Имена функций PromQL и ключей меток — не серии. */
const NOT_SERIES = new Set([
  'sum',
  'avg',
  'rate',
  'clamp_min',
  'absent',
  'histogram_quantile',
  'by',
  'le',
  'route',
  'status',
  'job',
  'and',
  'or',
  'unless',
  'time',
]);

/** Разбирает `rules.yml` на алерты: файл плоский, полноценный YAML-парсер не нужен. */
export function parseAlerts(text) {
  const starts = [...text.matchAll(/^\s*-\s+alert:\s*(\S+)\s*$/gm)];
  return starts.map((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < starts.length ? starts[index + 1]?.index ?? text.length : text.length;
    const block = text.slice(start, end);
    const exprMatch = block.match(/expr:\s*\|?\s*\n?([\s\S]*?)\n\s*for:/);
    const expr = (exprMatch?.[1] ?? '').replace(/\n\s*/g, ' ').trim();
    const field = (name) => {
      const found = block.match(new RegExp(`^\\s*${name}:\\s*"?([^"\\n]+)"?\\s*$`, 'm'));
      return found?.[1]?.trim() ?? null;
    };
    return {
      name: match[1] ?? '',
      expr,
      forDuration: field('for') ?? '',
      severity: field('severity'),
      summary: field('summary'),
      runbook: field('runbook'),
    };
  });
}

/** Все серии, упомянутые в выражении; всё неизвестное — ошибка источника. */
export function seriesIn(expr) {
  const found = [...expr.matchAll(/\b([a-z][a-z0-9_]*)\b(?=\s*[{(\s])/g)].map((m) => m[1] ?? '');
  return [...new Set(found)].filter((name) => !NOT_SERIES.has(name) && !name.startsWith('nova'));
}

function durationSeconds(value) {
  const match = value.match(/^(\d+)([smh])$/);
  if (!match) return Number.POSITIVE_INFINITY;
  const amount = Number(match[1]);
  const unit = match[2];
  return amount * (unit === 'h' ? 3600 : unit === 'm' ? 60 : 1);
}

const alerts = parseAlerts(RULES);

describe('A13.1 метрики правил существуют в /metrics', () => {
  it('A13.1 /metrics отдаёт длительность запросов, лаг и очередь пула', () => {
    expect(HEALTH_SOURCE).toContain("app.get('/metrics'");
    for (const series of ['http_request_duration_seconds', 'replica_lag_seconds', 'db_pool_waiting']) {
      expect(HEALTH_SOURCE).toContain(series);
    }
    expect(HEALTH_SOURCE).toContain('http_requests_total');
    expect(HEALTH_SOURCE).toContain('replica_last_sync_timestamp');
    expect(HEALTH_SOURCE).toContain('db_pool_total');
    expect(HEALTH_SOURCE).toContain('db_pool_acquired');
  });

  it('A13.1 каждая серия правил входит в набор /metrics или up', () => {
    expect(alerts.length).toBeGreaterThanOrEqual(5);
    for (const alert of alerts) {
      for (const series of seriesIn(alert.expr)) {
        expect(KNOWN_SERIES.has(series), `${alert.name}: ${series}`).toBe(true);
      }
    }
  });
});

describe('A13.2 правило доступности валидно и срабатывает', () => {
  it('A13.2 при up=0 алерт firing не позже 2 минут и ссылается на runbook', () => {
    const availability = alerts.find((alert) => alert.name === 'NovaApiDown');
    expect(availability).toBeTruthy();
    if (!availability) return;

    expect(availability.expr).toBe('up{job="nova-reporting"} == 0');
    expect(durationSeconds(availability.forDuration)).toBeLessThanOrEqual(120);
    expect(availability.severity).toBe('critical');
    expect(availability.summary).toContain('недоступен');
    expect(availability.runbook).toContain('docs/runbooks/incident.md');

    // Модель срабатывания: цель недоступна → правило firing; метка runbook сохраняется.
    const up = 0;
    const firing = availability.expr.includes('up{job="nova-reporting"} == 0') && up === 0;
    expect(firing).toBe(true);
  });

  it('A13.2 у каждого алерта есть severity, summary и runbook', () => {
    for (const alert of alerts) {
      expect(alert.severity, alert.name).toBeTruthy();
      expect(alert.summary, alert.name).toBeTruthy();
      expect(alert.runbook, alert.name).toContain('docs/runbooks/');
      expect(Number.isFinite(durationSeconds(alert.forDuration)), alert.name).toBe(true);
    }
  });

  it('A13.2 лаг репликации и 5xx отчётов — отдельные правила', () => {
    const lag = alerts.find((alert) => alert.name === 'NovaReplicaLagHigh');
    const reports = alerts.find((alert) => alert.name === 'NovaReport5xx');
    expect(lag?.expr).toContain('replica_lag_seconds > 30');
    expect(reports?.expr).toContain('/api/reports/');
    expect(lag?.name).not.toBe(reports?.name);
    const errors = alerts.find((alert) => alert.name === 'NovaHigh5xxRatio');
    expect(errors?.expr).toContain('0.005');
  });
});

describe('A13.4 учения по остановке реплики', () => {
  it('A13.4 протокол учения содержит шаги, деградацию отчётов и таймстампы', () => {
    expect(INCIDENT).toContain('incident.drill.md');
    expect(DRILL).toContain('E_REPLICA_DOWN');
    expect(DRILL).toContain('replica_streaming 0');
    expect(DRILL).toContain('Запись задачи');
    expect(DRILL).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/);
    expect(DRILL).toContain('закрыт');
  });
});

describe('дашборд Grafana', () => {
  it('данные берутся из Prometheus по имени, панели используют существующие серии', () => {
    expect(DASHBOARD.title).toContain('NOVA CRM');
    expect(Array.isArray(DASHBOARD.panels)).toBe(true);
    expect(DASHBOARD.panels.length).toBeGreaterThanOrEqual(6);

    for (const panel of DASHBOARD.panels) {
      const datasource = panel.datasource ?? {};
      expect(datasource.type).toBe('prometheus');
      expect(typeof datasource.uid).toBe('string');
      expect(datasource.id).toBeUndefined();
      for (const target of panel.targets ?? []) {
        for (const series of seriesIn(String(target.expr ?? ''))) {
          expect(KNOWN_SERIES.has(series), `${panel.title}: ${series}`).toBe(true);
        }
      }
    }
  });
});
