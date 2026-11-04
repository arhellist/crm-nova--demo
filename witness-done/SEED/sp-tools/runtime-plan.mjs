/**
 * runtime-plan — план подъёма окружения и runtime-верификации, порождённый прогоном фабрики.
 *
 * Канон: catalogs/runtime-plan.md, catalogs/contour-smoke.md.
 * Схема: TEMPLATES/runtime-plan.md. Пример: SEED/runtime/runtime-plan.example.json.
 *
 * Зачем: при прогоне фабрика уже знает стек, порты, миграции, seed и фразы приёмки (шаги 02–07).
 * Значит она обязана **вывести** из них исполняемый план, а не оставлять заглушку `{{...}}`.
 * Фабрика не угадывает чужой стек — она переписывает собственные входы в команды и исполняет их.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { codeHash, fileDigest, gitHead, sha256 } from './evidence-lib.mjs';

export const PLAN_REL = 'runtime/runtime-plan.json';
export const ACCEPTANCE_RE = /^A\d{2,}\.\d+$/;
export const READY_TYPES = ['http', 'cmd'];

/** Заглушки шаблона: план с ними не исполняем — он ничего не описывает. */
const PLACEHOLDER_RE = /\{\{|\}\}|\bTODO\b|\bTBD\b|\bCHANGEME\b|\bPLACEHOLDER\b|example\.com|<[a-z][a-z_ -]*>|PRICING_PATH/i;

export function planFile(outRoot) {
  return path.join(outRoot, PLAN_REL);
}

function isPlaceholder(v) {
  return typeof v === 'string' && PLACEHOLDER_RE.test(v);
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/** Акты принятых заданий: D → фразы. Единственный источник «что должно быть проверено». */
function acceptedAcceptances(outRoot) {
  const evidenceDir = path.join(outRoot, 'evidence');
  const map = new Map();
  if (!fs.existsSync(evidenceDir)) return map;
  for (const f of fs.readdirSync(evidenceDir)) {
    const m = f.match(/^(D\d+)\.json$/);
    if (!m) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(evidenceDir, f), 'utf8'));
      const ids = (j.fit && j.fit.acceptance_ids) || [];
      const produces = (j.fit && j.fit.produces) || [];
      for (const id of ids) {
        const key = String(id).toUpperCase();
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ d: m[1], produces });
      }
    } catch {
      /* битый акт ловит evidence-gate */
    }
  }
  return map;
}

/** Фразы, объявленные в контракте: метка в плане не может быть фантомом. */
function contractAcceptances(outRoot, root) {
  const p = [path.join(outRoot, '01_contract.md'), path.join(root, 'witness-done', 'OUTPUT', '01_contract.md')].find((f) =>
    fs.existsSync(f)
  );
  if (!p) return null;
  const ids = new Set();
  for (const m of fs.readFileSync(p, 'utf8').matchAll(/\bA\d{2,}\.\d+\b/g)) ids.add(m[0].toUpperCase());
  return ids;
}

export function loadPlan(outRoot) {
  const file = planFile(outRoot);
  const out = { required: fs.existsSync(file), file: PLAN_REL, plan: null, issues: [], read_error: null };
  if (!out.required) return out;
  try {
    out.plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    out.issues.push(`${PLAN_REL} не читается как JSON: ${e.message}`);
    out.read_error = e.message;
  }
  return out;
}

/**
 * Статическая проверка плана. Ничего не исполняет: безопасно гонять в PR.
 * Возвращает покрытие — какие фразы подтверждаются, какие помечены N/A, какие провалены.
 */
export function checkPlan(root, outRoot, plan) {
  const issues = [];
  const coverage = { covered: [], na: [], uncovered: [], phantom: [] };
  if (!plan || typeof plan !== 'object') {
    return { ok: false, issues: [`${PLAN_REL}: план пуст или не объект`], coverage };
  }
  if (plan.version !== 1) issues.push(`${PLAN_REL}: version должен быть 1, получено ${plan.version ?? '—'}`);

  if (!Array.isArray(plan.stack) || plan.stack.length === 0) {
    issues.push(`${PLAN_REL}: stack пуст — из чего поднимать окружение, не сказано`);
  } else {
    plan.stack.forEach((s, i) => {
      if (!str(s)) issues.push(`${PLAN_REL}: stack[${i}] пуст`);
      else if (isPlaceholder(s)) issues.push(`${PLAN_REL}: stack[${i}] «${s}» — заглушка`);
    });
  }

  const up = Array.isArray(plan.up) ? plan.up : [];
  if (!up.length) issues.push(`${PLAN_REL}: up пуст — как поднимается рантайм, не описано`);
  const seenUp = new Set();
  up.forEach((u, i) => {
    const at = `up[${i}]`;
    const id = str(u && u.id);
    if (!id) issues.push(`${at}: id пуст`);
    else if (seenUp.has(id)) issues.push(`${at}: id «${id}» повторяется`);
    else seenUp.add(id);
    const cmd = str(u && u.cmd);
    if (!cmd) issues.push(`${at}: cmd пуст`);
    else if (isPlaceholder(cmd)) issues.push(`${at}: cmd «${cmd}» — заглушка, не команда`);
    const r = u && u.ready;
    if (!r || typeof r !== 'object') {
      issues.push(`${at}: ready отсутствует — непонятно, когда сервис готов`);
      return;
    }
    if (!READY_TYPES.includes(r.type)) issues.push(`${at}: ready.type «${r.type}» не из ${READY_TYPES.join('|')}`);
    if (r.type === 'http') {
      if (!str(r.url)) issues.push(`${at}: ready.url пуст`);
      else if (isPlaceholder(r.url)) issues.push(`${at}: ready.url «${r.url}» — заглушка`);
    }
    if (r.type === 'cmd') {
      if (!str(r.cmd)) issues.push(`${at}: ready.cmd пуст`);
      else if (isPlaceholder(r.cmd)) issues.push(`${at}: ready.cmd «${r.cmd}» — заглушка`);
    }
    const t = Number(r.timeout_s);
    if (!Number.isFinite(t) || t < 1 || t > 900) issues.push(`${at}: ready.timeout_s должен быть 1..900`);
  });

  const down = Array.isArray(plan.down) ? plan.down : [];
  if (!down.length) issues.push(`${PLAN_REL}: down пуст — teardown обязателен, иначе окружение не переиспользуемо`);
  down.forEach((d, i) => {
    const cmd = str(d && d.cmd);
    if (!cmd) issues.push(`down[${i}]: cmd пуст`);
    else if (isPlaceholder(cmd)) issues.push(`down[${i}]: cmd «${cmd}» — заглушка`);
  });

  const seed = Array.isArray(plan.seed) ? plan.seed : [];
  seed.forEach((s, i) => {
    const cmd = str(s && s.cmd);
    if (!cmd) issues.push(`seed[${i}]: cmd пуст`);
    else if (isPlaceholder(cmd)) issues.push(`seed[${i}]: cmd «${cmd}» — заглушка`);
    if (s && s.idempotent !== true) {
      issues.push(`seed[${i}]: idempotent должен быть true — повторный прогон не должен ломать состояние`);
    }
  });

  const verify = Array.isArray(plan.verify) ? plan.verify : [];
  if (!verify.length) issues.push(`${PLAN_REL}: verify пуст — верификация в рантайме не описана`);

  const contract = contractAcceptances(outRoot, root);
  const accepted = acceptedAcceptances(outRoot);
  const seenAcc = new Map();

  verify.forEach((v, i) => {
    const at = `verify[${i}]`;
    const acc = str(v && v.acceptance).toUpperCase();
    if (!acc) issues.push(`${at}: acceptance пуст`);
    else if (!ACCEPTANCE_RE.test(acc)) issues.push(`${at}: acceptance «${acc}» не в форме Axx.k`);
    else {
      if (seenAcc.has(acc)) issues.push(`${at}: acceptance ${acc} повторяется (см. verify[${seenAcc.get(acc)}])`);
      else seenAcc.set(acc, i);
      if (contract && !contract.has(acc)) {
        coverage.phantom.push(acc);
        issues.push(`${at}: ${acc} нет в 01_contract.md — фантомная метка`);
      }
    }
    const na = str(v && v.na);
    const reason = str(v && v.reason);
    if (na) {
      if (!reason) issues.push(`${at}: N/A без reason — отказ от проверки должен быть обоснован`);
      coverage.na.push({ acceptance: acc, reason: na });
      return;
    }
    const cmd = str(v && v.cmd);
    if (!cmd) {
      issues.push(`${at}: нет ни cmd, ни na — непонятно, чем проверяется ${acc || 'фраза'}`);
      return;
    }
    if (isPlaceholder(cmd)) issues.push(`${at}: cmd «${cmd}» — заглушка, не команда`);
    const exit = v.expect_exit === undefined ? 0 : Number(v.expect_exit);
    if (!Number.isInteger(exit)) issues.push(`${at}: expect_exit должен быть целым`);
    if (v.artifacts !== undefined && !Array.isArray(v.artifacts)) issues.push(`${at}: artifacts должен быть массивом`);
    coverage.covered.push({ acceptance: acc, cmd, expect_exit: exit, artifacts: v.artifacts || [] });
  });

  // Полнота: каждая принятая фраза либо проверяется, либо явно снята с причиной.
  const coveredSet = new Set(coverage.covered.map((c) => c.acceptance));
  const naSet = new Set(coverage.na.map((c) => c.acceptance));
  for (const [acc, list] of accepted) {
    if (!coveredSet.has(acc) && !naSet.has(acc)) {
      coverage.uncovered.push({ acceptance: acc, tasks: list.map((x) => x.d) });
    }
  }
  if (coverage.uncovered.length) {
    issues.push(
      `runtime-верификация не покрывает принятые фразы: ${coverage.uncovered
        .map((u) => `${u.acceptance} (${u.tasks.join(',')})`)
        .join(', ')}`
    );
  }

  return { ok: issues.length === 0, issues, coverage, accepted_count: accepted.size };
}

function runLogged(cmd, cwd, logFile, timeoutMs = 600000) {
  const r = spawnSync(cmd, { shell: true, cwd, encoding: 'utf8', timeout: timeoutMs });
  const timedOut = r.error && r.error.code === 'ETIMEDOUT';
  const exit = timedOut ? 124 : r.status ?? 1;
  const body = [
    `$ ${cmd}`,
    `# exit=${exit}${timedOut ? ' (timeout)' : ''}`,
    '--- stdout ---',
    (r.stdout || '').slice(0, 20000),
    '--- stderr ---',
    (r.stderr || '').slice(0, 20000),
  ].join('\n');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.writeFileSync(logFile, body);
  return { cmd, exit, timedOut, log: logFile, out: (r.stdout || '').slice(0, 500) };
}

async function waitReady(ready, root, deadline) {
  const timeoutMs = Number(ready.timeout_s) * 1000;
  const until = Date.now() + timeoutMs;
  let last = 'нет попыток';
  while (Date.now() < until && Date.now() < deadline) {
    if (ready.type === 'http') {
      try {
        const res = await fetch(ready.url, { signal: AbortSignal.timeout(Math.min(5000, timeoutMs)) });
        if (!ready.expect || res.status === Number(ready.expect)) return { ok: true, detail: `HTTP ${res.status}` };
        last = `HTTP ${res.status} (ждали ${ready.expect || 200})`;
      } catch (e) {
        last = `fetch: ${e.message}`;
      }
    } else {
      const r = spawnSync(ready.cmd, { shell: true, cwd: root, encoding: 'utf8', timeout: 15000 });
      if ((r.status ?? 1) === 0) return { ok: true, detail: 'ready cmd exit 0' };
      last = `ready cmd exit ${r.status ?? 1}: ${(r.stderr || '').slice(0, 200)}`;
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  return { ok: false, detail: `timeout ${ready.timeout_s}s, последнее: ${last}` };
}

function slug(s) {
  return String(s).replace(/[^A-Za-z0-9._-]+/g, '-');
}

/**
 * Исполнение плана: up → ready → seed → verify → down (всегда).
 * Пишет акт RELEASE-runtime-verify.json и, если внешнего трейса нет, Dxx.trace.json.
 * `source` в трейсе честно говорит, что его сняла сама фабрика — это не внешнее доказательство.
 */
export async function executePlan(root, outRoot, plan, opts = {}) {
  const started = Date.now();
  const budgetMs = (opts.budgetMin || 30) * 60 * 1000;
  const deadline = started + budgetMs;
  const traceDir = path.join(outRoot, 'evidence', 'trace');
  fs.mkdirSync(traceDir, { recursive: true });
  const planHash = sha256(fs.readFileSync(planFile(outRoot)));
  const acts = { up: [], seed: [], verify: [], na: [], uncovered: [], down: null, issues: [] };

  // Бюджет — на весь прогон, а не на каждую команду: иначе `--budget-min 5` и двадцать
  // команд по 10 минут дают три часа. Остаток передаётся в таймаут каждой команды.
  const remaining = () => Math.max(0, deadline - Date.now());
  const runStep = (cmd, logRel, what) => {
    const left = remaining();
    if (left <= 0) {
      acts.issues.push(`${what}: бюджет ${Math.round(budgetMs / 60000)} мин исчерпан — команда не запускалась`);
      return null;
    }
    return runLogged(cmd, root, logRel, Math.min(600000, left));
  };

  for (const u of plan.up || []) {
    const r = runStep(u.cmd, path.join(traceDir, `${slug(u.id)}.log`), `up ${u.id}`);
    if (!r) break;
    const ready = r.exit === 0 ? await waitReady(u.ready, root, deadline) : { ok: false, detail: 'cmd failed' };
    acts.up.push({ id: u.id, exit: r.exit, ready: ready.ok, detail: ready.detail, log: path.relative(outRoot, r.log) });
    if (r.exit !== 0) acts.issues.push(`up ${u.id}: exit ${r.exit}`);
    else if (!ready.ok) acts.issues.push(`up ${u.id}: не готов — ${ready.detail}`);
    if (acts.issues.length) break;
  }

  if (!acts.issues.length) {
    for (const s of plan.seed || []) {
      const id = s.id || `seed-${acts.seed.length + 1}`;
      const r = runStep(s.cmd, path.join(traceDir, `${slug(id)}.log`), `seed ${id}`);
      if (!r) break;
      acts.seed.push({ id, exit: r.exit, log: path.relative(outRoot, r.log) });
      if (r.exit !== 0) {
        acts.issues.push(`seed ${id}: exit ${r.exit}`);
        break;
      }
    }
  }

  const { coverage } = checkPlan(root, outRoot, plan);
  acts.uncovered = coverage.uncovered;
  acts.na = coverage.na;

  if (!acts.issues.length) {
    for (const v of coverage.covered) {
      const r = runStep(v.cmd, path.join(traceDir, `${slug(v.acceptance)}.log`), `verify ${v.acceptance}`);
      if (!r) break;
      const artifacts = [];
      for (const a of v.artifacts || []) {
        const abs = path.isAbsolute(a) ? a : path.join(root, a);
        const d = fileDigest(abs);
        if (d === null) acts.issues.push(`verify ${v.acceptance}: артефакт «${a}» не создан`);
        else artifacts.push({ ref: path.relative(root, abs), sha256: d });
      }
      const ok = r.exit === v.expect_exit;
      acts.verify.push({
        acceptance: v.acceptance,
        exit: r.exit,
        expect_exit: v.expect_exit,
        ok,
        log: path.relative(outRoot, r.log),
        artifacts,
      });
      if (!ok) acts.issues.push(`verify ${v.acceptance}: exit ${r.exit}, ждали ${v.expect_exit}`);
    }
  }

  // Teardown выполняется всегда: провал теста не должен оставлять окружение живым.
  const down = plan.down || [];
  const downResults = [];
  for (const d of down) {
    const r = runLogged(d.cmd, root, path.join(traceDir, `down-${downResults.length + 1}.log`), 120000);
    downResults.push({ cmd: d.cmd, exit: r.exit, log: path.relative(outRoot, r.log) });
  }
  acts.down = downResults;
  for (const d of downResults) if (d.exit !== 0) acts.issues.push(`down: exit ${d.exit}`);

  const tax_pass = acts.issues.length === 0 && acts.verify.every((v) => v.ok);

  // Трейс: только если снаружи его не сняли. Автотрейс помечен produced_by — доверие к нему ниже.
  const byTask = acceptedAcceptances(outRoot);
  const traces = [];
  for (const v of acts.verify) {
    if (!v.ok) continue;
    for (const info of byTask.get(v.acceptance) || []) {
      const d = info.d;
      const tf = path.join(outRoot, 'evidence', `${d}.trace.json`);
      // Внешний трейс не трогаем. Свой — обновляем: после смены кода старый автотрейс
      // навсегда блокировал pre_ci («трейс от другого кода»), и починить это можно было
      // только удалением файла руками (DEC-024).
      if (fs.existsSync(tf)) {
        let old = null;
        try {
          old = JSON.parse(fs.readFileSync(tf, 'utf8'));
        } catch {
          old = null;
        }
        const ours = Boolean(old && old.produced_by && old.produced_by.tool === 'sp-verify');
        // Внешний трейс не трогаем никогда: его снимал человек, фабрика не вправе его заменить.
        if (!ours) continue;
      }
      const logAbs = path.join(outRoot, v.log);
      const entries = [
        { type: 'console_log', ref: `evidence/trace/${path.basename(v.log)}`, sha256: fileDigest(logAbs) || undefined },
      ];
      for (const a of v.artifacts) entries.push({ type: 'api_response', ref: a.ref, sha256: a.sha256 });
      const trace = {
        d,
        commit: gitHead(root),
        code_hash: codeHash(root, info.produces),
        captured_at: new Date().toISOString(),
        source: 'sp-verify --gate runtime (план исполнен фабрикой)',
        produced_by: { tool: 'sp-verify', gate: 'runtime', plan_hash: planHash, acceptance: v.acceptance },
        entries,
      };
      fs.writeFileSync(tf, JSON.stringify(trace, null, 2) + '\n');
      traces.push(`evidence/${d}.trace.json`);
    }
  }

  const evidence = {
    gate: 'runtime',
    plan: PLAN_REL,
    plan_hash: planHash,
    stack: plan.stack,
    up: acts.up,
    seed: acts.seed,
    verify: acts.verify,
    na: acts.na,
    uncovered: acts.uncovered.map((u) => u.acceptance),
    down: acts.down,
    traces,
    executed: true,
    duration_s: Math.round((Date.now() - started) / 1000),
    issues: acts.issues,
    tax_pass,
    timestamp: new Date().toISOString(),
  };
  return evidence;
}
