#!/usr/bin/env node
/**
 * sp-verify — инструментальная приёмка Witness Done
 *
 * Гейты: pre_ci | change | d-prompt-quality | product-smoke | self-audit | baseline | pre_release | evidence-sync
 * Канон: catalogs/verification-tax.md (правило с v1.10), catalogs/contour-smoke.md, PIPELINE/10b_self_audit.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  BOOKKEEPING_PREFIXES,
  REVIEW_VERDICTS,
  codeHash,
  coverageConfidence,
  fileDigest,
  findIncompletenessLabels,
  gitHead,
  globToRe,
  resolveProjectRoot,
  sha256,
  reviewCheck,
  seal,
  verifyEvidenceFile,
} from './evidence-lib.mjs';
import { idOf, parseProgress } from './progress-lib.mjs';
import { bindAcceptance, checkTestPlan, parseAcceptancePhrases } from './acceptance-bind.mjs';
import { selectInvariants, waiverState } from './invariants-lib.mjs';
import { PLAN_REL, checkPlan, executePlan, loadPlan } from './runtime-plan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {
    d: null,
    change: null,
    gate: 'pre_ci',
    root: process.cwd(),
    rootGiven: false,
    factory: null,
    skipCommands: false,
    batch: null,
    verifyEvidence: null,
    intake: null,
    base: null,
    budgetMin: 30,
    quick: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--d') out.d = argv[++i];
    else if (a === '--change') out.change = argv[++i];
    else if (a === '--gate') out.gate = argv[++i];
    else if (a === '--batch') out.batch = Number(argv[++i]);
    else if (a === '--root') {
      out.root = path.resolve(argv[++i]);
      out.rootGiven = true;
    }
    else if (a === '--factory') out.factory = path.resolve(argv[++i]);
    else if (a === '--skip-commands') out.skipCommands = true;
    else if (a === '--quick') {
      out.quick = true;
      out.skipCommands = true;
    } else if (a === '--verify-evidence') out.verifyEvidence = argv[++i];
    else if (a === '--intake') out.intake = argv[++i];
    else if (a === '--base') out.base = argv[++i];
    else if (a === '--budget-min') out.budgetMin = Number(argv[++i]) || 30;
  }
  if (!out.factory) {
    const cand = path.join(out.root, 'witness-done');
    out.factory = fs.existsSync(cand) ? cand : path.resolve(__dirname, '../..');
  }
  if (!out.rootGiven) out.root = resolveProjectRoot(out.root, out.factory);
  return out;
}

function help() {
  console.log(`Usage:
  sp-verify.mjs --d D03 --gate pre_ci [--skip-commands] [--base <ref>]
  sp-verify.mjs --change <id> --gate change [--skip-commands]
  sp-verify.mjs --gate d-prompt-quality [--batch N]
  sp-verify.mjs --gate acceptance [--d D03]     # связь «фраза ACCEPTANCE ↔ тест» + test-plan
  sp-verify.mjs --gate product-smoke [--skip-commands]
  sp-verify.mjs --gate runtime-plan            # статика плана: команды плана не исполняются
  sp-verify.mjs --gate runtime [--budget-min N] # подъём по плану + верификация + teardown
  sp-verify.mjs --gate self-audit
  sp-verify.mjs --gate baseline [--root .]
  sp-verify.mjs --gate pre_release
  sp-verify.mjs --gate evidence-sync
  sp-verify.mjs --verify-evidence OUTPUT/evidence/D03.json [--root .]
  sp-verify.mjs --gate spec-packet --intake <ID> [--root .]

  pre_ci (L1+): parses ## ACCEPTANCE → fit.acceptance_ids; L2/L3 require METHOD /path in app_contracts;
           проверяет связь «фраза ↔ тест» (@acceptance Axx.k, утверждение, не skip, файл в PRODUCES).
  acceptance: то же по всем заданиям + текст фразы + согласие tests/test-plan-Dxx.md с тестами.
  d-prompt-quality: validates D prompts (CONTEXT_PACK/HOW/INVARIANTS/ACCEPTANCE/SIZE_BUDGET) in batches ≤5.
  product-smoke: validates runbook + runs scripts/smoke/product-smoke.* when present.
  self-audit: 10b audit — coverage, exit-criteria, prompt quality, evidence for done D.
  baseline: R01 — MUST/SHALL + ≥2 scenarios (happy + negative/boundary) per requirement.
  change: validates spec-state/changes/<id> (delta format, baseline links, tasks checklist, compatibility, test runner).
  spec-packet: minimal completeness of journal/intake/<ID>-packet.md (goal, non-goals, criteria, evidence).
  verify-evidence: independent check of one act — evidence_hash + code_hash against the current tree; no transcript needed.
  --quick is an alias of --skip-commands (fast structural iteration).
  --base <ref>: diff base for Plan-to-Proof (default: merge-base with origin/main, else HEAD).
  Does not prove tests match Given/When/Then semantics — it proves the declared phrase has an
  executed assertion (annotation, assertion, not skipped, file in PRODUCES, digest bound in the act).
`);
}

function outputDir(root, factory) {
  // Корень канона: прогона здесь нет, акты не должны попадать в OUTPUT репозитория
  // (иначе `doctor --strict` и ./validate.sh краснеют после любого гейта). DEC-033.
  const isCanon =
    path.resolve(root) === path.resolve(factory) &&
    fs.existsSync(path.join(factory, 'PIPELINE', '00_bootstrap.md')) &&
    fs.existsSync(path.join(factory, 'catalogs')) &&
    !fs.existsSync(path.join(factory, 'OUTPUT', 'MANIFEST.md'));
  if (isCanon) return path.join(factory, '.witness-done-work');
  // OUTPUT проекта важнее OUTPUT того каталога, откуда запущен CLI: агент может звать
  // копию CLI из другого места (`--root <проект>`), и акт обязан лечь в проект (DEC-033).
  const b = path.join(root, 'witness-done', 'OUTPUT');
  const a = path.join(factory, 'OUTPUT');
  if (fs.existsSync(b)) return b;
  if (fs.existsSync(a)) return a;
  return a;
}

/**
 * Режим прогона: `lite` экономит артефакты, но не отменяет акт.
 * Источник — env `SP_LITE=1` или поле MANIFEST «Режим прогона».
 */
function runMode(outRoot) {
  if (process.env.SP_LITE === '1') return 'lite';
  const mf = path.join(outRoot, 'MANIFEST.md');
  if (!fs.existsSync(mf)) return 'full';
  const m = fs.readFileSync(mf, 'utf8').match(/^\|\s*Режим прогона\s*\|\s*(full|lite)\s*\|/im);
  return m ? m[1].toLowerCase() : 'full';
}

function findPrompt(outRoot, d) {
  const dir = path.join(outRoot, 'prompts');
  if (!fs.existsSync(dir)) return null;
  const hit = fs.readdirSync(dir).find((f) => f.startsWith(`${d}_`) || f.startsWith(`${d}.`));
  if (!hit) return null;
  const p = path.join(dir, hit);
  return { path: p, text: fs.readFileSync(p, 'utf8') };
}

function section(text, name) {
  const re = new RegExp(`## ${name}([\\s\\S]*?)(?:\\n## |$)`, 'i');
  const m = text.match(re);
  return m ? m[1] : '';
}

function field(block, key) {
  const re = new RegExp(`\\|\\s*${key}\\s*\\|\\s*([^|]+)\\|`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

function parseLevel(taxBlock) {
  const v = field(taxBlock, 'level') || 'L1';
  const m = v.match(/L[0-3]/i);
  return m ? m[0].toUpperCase() : 'L1';
}

function listProduces(text) {
  const prod = section(text, 'PRODUCES');
  const paths = [];
  for (const line of prod.split('\n')) {
    const m = line.match(/[-*`]\s*`?([^\s`|]+)`?/);
    if (m && (m[1].includes('/') || m[1].includes('.'))) paths.push(m[1].replace(/^[`]+|[`]+$/g, ''));
  }
  return paths;
}

function runCmd(cmd, cwd) {
  const r = spawnSync(cmd, { shell: true, cwd, encoding: 'utf8' });
  return { cmd, exit: r.status ?? 1, stdout: (r.stdout || '').slice(0, 2000), stderr: (r.stderr || '').slice(0, 2000) };
}

function loadVerifyCommands(outRoot) {
  const p = path.join(outRoot, 'tooling', 'verify-commands.md');
  const defaults = { lint: 'npm run lint', typecheck: 'npx tsc --noEmit', test: 'npm test' };
  if (!fs.existsSync(p)) return defaults;
  const t = fs.readFileSync(p, 'utf8');
  /**
   * Метка ищется только в начале строки (после списка/таблицы), значение — на той же строке.
   * До v1.24 `[^`]+` переходил через перевод строки, и `grab('lint')` возвращал хвост
   * следующей строки: гейт исполнял не ту команду, которую написали (DEC-024).
   */
  const grab = (label) => {
    const inline = t.match(
      new RegExp(`^[\\s|>*_-]*${label}\\s*(?:[:=]|\\|)\\s*\`([^\`\\n]+)\``, 'im'),
    );
    if (inline) return inline[1].trim();
    const plain = t.match(new RegExp(`^[\\s|>*_-]*${label}\\s*(?:[:=]|\\|)\\s*([^\\n|]+)$`, 'im'));
    return plain ? plain[1].trim() : null;
  };
  const picked = {};
  for (const key of ['lint', 'typecheck', 'test']) {
    const v = grab(key);
    picked[key] = v || defaults[key];
  }
  return picked;
}

function checkDepsDone(outRoot, fitBlock) {
  const raw = field(fitBlock, 'depends_done') || '';
  // Якоря обязательны: без них дефис в `D01-D02` превращал список зависимостей в «нет зависимостей».
  if (!raw || /^(—|-|none|нет)$/i.test(raw)) return { ok: true, depends: [] };
  const depends = [];
  for (const token of raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)) {
    const single = token.match(/^D(\d{1,4})$/i);
    if (single) {
      depends.push(`D${single[1].padStart(2, '0')}`);
      continue;
    }
    // Диапазон `D09-D10` — это две зависимости, а не один нераспознанный токен.
    const range = token.match(/^D(\d{1,4})\s*[-–—]\s*D?(\d{1,4})$/i);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (to >= from && to - from <= 50) {
        for (let i = from; i <= to; i += 1) depends.push(`D${String(i).padStart(2, '0')}`);
        continue;
      }
    }
    // Всё, что начинается с D, но не разобрано, остаётся в списке: гейт падает, а не молчит.
    if (/^D\d/i.test(token)) depends.push(token);
  }
  const progressPath = path.join(outRoot, 'roadmaps', 'progress.md');
  if (!fs.existsSync(progressPath)) {
    return { ok: false, depends, notDone: depends, reason: 'no progress.md' };
  }
  const progress = fs.readFileSync(progressPath, 'utf8');
  const notDone = [];
  for (const d of depends) {
    const row = progress.split('\n').find((l) => l.includes(`| ${d} `) || l.includes(`| ${d}|`));
    if (!row || !/\bdone\b/i.test(row)) notDone.push(d);
  }
  return { ok: notDone.length === 0, depends, notDone };
}

function parseAcceptanceIds(promptText) {
  const block = section(promptText, 'ACCEPTANCE');
  if (!block) return { ids: [], na: false, note: 'missing ## ACCEPTANCE' };
  if (/^\s*N\/A\b/im.test(block) || /\bN\/A\s*[—\-–]/i.test(block)) {
    return { ids: [], na: true, note: 'ACCEPTANCE N/A' };
  }
  const uniq = [...new Set([...block.matchAll(/\b(A\d+\.\d+)\b/gi)].map((m) => m[1]))];
  return { ids: uniq, na: false, note: uniq.length ? null : 'no Axx.k ids in ACCEPTANCE' };
}

/**
 * Пороги ACCEPTANCE по уровню. Те же, что в d-prompt-quality: приёмка не может быть мягче
 * написания задания, иначе задание с двумя Axx проходит pre_ci и падает только на качестве промпта.
 */
function acceptanceThreshold(level) {
  return level === 'L2' || level === 'L3' ? { min: 6, max: 12 } : { min: 3, max: Infinity };
}

/** Блокеры из 07_conflicts.md: строки таблицы, в которых упомянут blocker. */
function conflictBlockers(outRoot) {
  const p = path.join(outRoot, 'docs', '07_conflicts.md');
  if (!fs.existsSync(p)) return { file: null, blockers: [] };
  const blockers = [];
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!/^\|/.test(line) || !/blocker/i.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    const id = (cells[0] || '').replace(/`/g, '');
    if (!id || /^[-: ]+$/.test(id) || /^(id|конфликт|conflict)/i.test(id)) continue;
    blockers.push(id);
  }
  return { file: path.relative(outRoot, p), blockers };
}

/** Изменённые в рабочем дереве файлы (включая untracked), относительно корня проекта. */
function gitChangedFiles(root) {
  const r = spawnSync('git', ['status', '--porcelain', '-uall'], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) return null;
  return (r.stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const body = l.slice(2).trim();
      const arrow = body.split(' -> ');
      return (arrow.length > 1 ? arrow[1] : body).replace(/^"|"$/g, '');
    });
}

/** Служебные префиксы — один список на фабрику (evidence-lib), чтобы гейты не расходились. */
const BOOKKEEPING = BOOKKEEPING_PREFIXES;

/**
 * Расширения кода. Нужны только для L0: уровень docs-only не может трогать код,
 * иначе объявление уровня превращается в способ отменить налог.
 */
const CODE_EXT =
  /\.(?:m?js|cjs|tsx?|jsx|py|go|java|kt|kts|rb|php|rs|cs|cc|cpp|cxx|hpp|h|swift|scala|sh|bash|zsh|sql|vue|svelte|dart|lua|ex|exs|erl|clj|tf)$/i;

function isCodeFile(file) {
  return CODE_EXT.test(String(file || ''));
}

/** Glob в PRODUCES: `**` — любая глубина, `*` — в пределах сегмента, `?` — один символ. */
/** Файлы под статическим префиксом glob-шаблона: нужны для проверки «glob не пуст». */
function walkFiles(root, pattern) {
  const clean = pattern.replace(/^\.[/]/, '');
  const staticPart = clean.split(/[*?]/)[0];
  const base = path.join(root, staticPart.endsWith('/') ? staticPart : path.dirname(staticPart) || '.');
  const out = [];
  const walk = (dir, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else out.push(r);
    }
  };
  if (!fs.existsSync(base)) return out;
  const relBase = path.relative(root, base).replace(/\\/g, '/');
  walk(base, relBase === '.' ? '' : relBase);
  return out.map((f) => f.replace(/^\.\//, ''));
}

/** Заявлен ли файл в PRODUCES: точный путь, каталог или glob. */
function declaredMatches(file, declared) {
  return declared.some((d) => {
    const n = d.replace(/^\.\//, '');
    if (!n) return false;
    if (/[*?]/.test(n)) return globToRe(n).test(file);
    return file === n || file.startsWith(`${n}/`);
  });
}

/** Затронутые файлы: diff относительно base (по умолчанию merge-base с origin/main, иначе HEAD) + untracked. */
function gitTouched(root, base) {
  let ref = base;
  if (!ref) {
    const mb = spawnSync('git', ['merge-base', 'HEAD', 'origin/main'], { cwd: root, encoding: 'utf8' });
    ref = mb.status === 0 && (mb.stdout || '').trim() ? (mb.stdout || '').trim() : 'HEAD';
  }
  const diff = spawnSync('git', ['diff', '--name-only', ref], { cwd: root, encoding: 'utf8' });
  if (diff.status !== 0) {
    return { ok: false, base: ref, note: `git diff ${ref} не выполнился — proof_debt не посчитан`, files: [] };
  }
  const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
  });
  const files = [
    ...(diff.stdout || '').split('\n'),
    ...(untracked.status === 0 ? (untracked.stdout || '').split('\n') : []),
  ]
    .map((l) => l.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
    .map((f) => f.replace(/^\.\//, ''));
  return { ok: true, base: ref, files: [...new Set(files)].sort() };
}

/**
 * Plan-to-Proof: симметричная сверка заявленного и тронутого.
 * `proof_debt` — файлы, которые тронуты, но не заявлены: это и есть неоплаченный налог.
 * Файл, заявленный в PRODUCES другого задания, долгом этого акта не считается (DEC-038):
 * иначе незакоммиченная работа над D02 валит приёмку D01.
 */
function planToProof(root, produces, base, opts = {}) {
  const t = gitTouched(root, base);
  const declared = (produces || []).map((p) => p.replace(/^\.\//, '')).filter(Boolean);
  const other = (opts.otherDeclared || []).map((p) => p.replace(/^\.\//, '')).filter(Boolean);
  if (!t.ok) {
    return {
      ok: false,
      base: t.base,
      declared,
      touched: [],
      missing: declared,
      extra: [],
      proof_debt: [],
      note: t.note,
    };
  }
  const touched = t.files.filter((f) => !BOOKKEEPING.some((p) => f.startsWith(p)));
  const missing = declared.filter((d) => !touched.some((f) => declaredMatches(f, [d])));
  const extra = touched.filter(
    (f) => !declaredMatches(f, declared) && !declaredMatches(f, other),
  );
  return {
    ok: true,
    base: t.base,
    declared,
    touched,
    missing,
    extra,
    proof_debt: extra,
    note: null,
  };
}

/**
 * PRODUCES всех заданий, кроме текущего. Нужны, чтобы не объявлять долгом чужую работу
 * (DEC-038). Отсутствие каталога промптов — не ошибка: долг просто считается как раньше.
 */
function collectOtherProduces(outRoot, currentD) {
  const dir = path.join(outRoot, 'prompts');
  if (!fs.existsSync(dir)) return [];
  const current = String(currentD || '').toUpperCase();
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!/^D\d+.*\.md$/i.test(f)) continue;
    const d = (f.match(/^D\d+/) || [''])[0].toUpperCase();
    if (d === current) continue;
    out.push(...listProduces(fs.readFileSync(path.join(dir, f), 'utf8')));
  }
  return [...new Set(out.map((p) => p.replace(/^\.\//, '')).filter(Boolean))];
}

/** Что изменилось сверх PRODUCES. Акт показывает факт; гейт по репозиторию — sp doctor. */
function diffAgainstProduces(root, produces) {
  const changed = gitChangedFiles(root);
  if (changed === null) return { ok: false, note: 'git недоступен — сверка с PRODUCES пропущена', files: [] };
  const norm = (p) => p.replace(/^\.\//, '');
  const keep = produces.map(norm);
  const outside = changed.filter((f) => {
    const file = norm(f);
    if (BOOKKEEPING.some((p) => file.startsWith(p))) return false;
    return !declaredMatches(file, keep);
  });
  return { ok: true, files: outside };
}

/** Сверка акта с заданием: Axx в акте должны совпадать с ACCEPTANCE промпта. */
function acceptanceMatchesPrompt(outRoot, d, ev) {
  const prompt = findPrompt(outRoot, d);
  if (!prompt) return { ok: true, skip: true, note: 'prompt not found' };
  const acc = parseAcceptanceIds(prompt.text);
  const evIds = ((ev.fit && ev.fit.acceptance_ids) || []).map((x) => String(x).toUpperCase()).sort();
  const promptIds = acc.ids.map((x) => String(x).toUpperCase()).sort();
  const same = evIds.length === promptIds.length && evIds.every((x, i) => x === promptIds[i]);
  return {
    ok: same,
    skip: false,
    evidence_ids: evIds,
    prompt_ids: promptIds,
    note: same ? null : `evidence acceptance_ids ${evIds.join(',') || '[]'} != prompt ${promptIds.join(',') || '[]'}`,
  };
}

/**
 * Живая проверка связи «фраза ↔ тест» для принятого задания (DEC-027).
 * Акт хранит `binding_hash` — отпечаток фраз (их текста) и закрывающих их тестов.
 * Если после приёмки правили формулировку или переименовывали/удаляли тест, связь перестала
 * быть той, что приняли: это не «мелкая правка», а другая приёмка.
 */
function acceptanceBindingStillValid(root, outRoot, d, ev) {
  const prompt = findPrompt(outRoot, d);
  if (!prompt) return { skip: true, issues: [] };
  const level = (ev.level || 'L1').toUpperCase();
  if (level === 'L0') return { skip: true, issues: [] };
  const saved = ev.fit && ev.fit.acceptance_binding;
  if (!saved) {
    return {
      skip: false,
      issues: ['акт без связи «фраза ↔ тест» (acceptance_binding) — перегенерируй pre_ci'],
    };
  }
  const binding = bindAcceptance({
    root,
    promptText: prompt.text,
    produces: (ev.fit && ev.fit.produces) || [],
    exemptIds: saved.exempt || [],
  });
  const issues = [...binding.issues];
  if (saved.binding_hash && binding.binding_hash && saved.binding_hash !== binding.binding_hash) {
    issues.push('связь фраз и тестов изменилась после приёмки — перегенерируй pre_ci');
  }
  return { skip: false, issues, binding };
}

/** Путь в каноническом виде: ведущий слэш, без query и хвостового слэша. */function normPath(p) {
  const s = String(p || '').trim().replace(/[?#].*$/, '').replace(/[.,;]+$/, '');
  const withSlash = s.startsWith('/') ? s : `/${s}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
}

/**
 * Пары «METHOD /path» из контракта. Метод и путь сверяются вместе, а не как два отдельных
 * подстрока-теста: до v1.24 `GET /orders` проходил, если в файле где-то был `get:` и где-то `/orders`.
 */
function openapiOps(file, body) {
  const out = new Set();
  if (/\.ya?ml$/i.test(file)) {
    let inPaths = false;
    let cur = null;
    let curIndent = -1;
    for (const line of body.split('\n')) {
      if (/^paths:\s*$/.test(line)) {
        inPaths = true;
        cur = null;
        continue;
      }
      if (!inPaths) continue;
      if (/^\S/.test(line)) {
        inPaths = false;
        cur = null;
        continue;
      }
      const mp = line.match(/^(\s{2,})(['"]?)(\/[^'":\s]*)\2:\s*$/);
      if (mp) {
        cur = normPath(mp[3]);
        curIndent = mp[1].length;
        continue;
      }
      const mo = line.match(/^(\s+)(get|post|put|patch|delete|head|options):\s*$/i);
      if (mo && cur && mo[1].length > curIndent) out.add(`${mo[2].toUpperCase()} ${cur}`);
    }
    return out;
  }
  for (const m of body.matchAll(/\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[A-Za-z0-9_{}./:-]*)/gi)) {
    out.add(`${m[1].toUpperCase()} ${normPath(m[2])}`);
  }
  return out;
}

function checkAppContracts(outRoot, fitBlock, level) {
  const raw = field(fitBlock, 'app_contracts') || '';
  const ops = [...raw.matchAll(/(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s,|\]]+)/gi)].map(
    (m) => `${m[1].toUpperCase()} ${normPath(m[2])}`,
  );
  const openapiCandidates = [
    path.join(outRoot, 'specs', 'openapi.yaml'),
    path.join(outRoot, 'specs', 'openapi.yml'),
    path.join(outRoot, 'specs', 'openapi.md'),
  ];
  const openapi = openapiCandidates.find((p) => fs.existsSync(p));
  if (ops.length === 0) {
    if (level === 'L2' || level === 'L3') {
      return {
        ok: false,
        ops_checked: [],
        note: 'L2/L3 require ≥1 METHOD /path in app_contracts (empty ops_checked forbidden)',
      };
    }
    return { ok: true, ops_checked: [], note: 'no ops in FIT_CHECKS (allowed for L0/L1)' };
  }
  if (!openapi) return { ok: false, ops_checked: ops, missing: ops, note: 'no openapi' };
  const body = fs.readFileSync(openapi, 'utf8');
  const declaredOps = openapiOps(openapi, body);
  const missing = ops.filter((op) => !declaredOps.has(op));
  return {
    ok: missing.length === 0,
    ops_checked: ops,
    declared_ops: [...declaredOps].sort(),
    missing,
    note: missing.length
      ? `контракт не содержит ${missing.join(', ')} (метод и путь сверяются вместе)`
      : null,
  };
}

function parseList(raw) {
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim().replace(/^`|`$/g, ''))
    .filter((s) => s && !/^—$|^-$|^none$|^нет$/i.test(s));
}

function checkModule(outRoot, fitBlock) {
  const mod = field(fitBlock, 'module') || 'none';
  if (/^none|—|-|нет$/i.test(mod)) return { ok: true, module: 'none' };
  const planPath = path.join(outRoot, 'docs', '07_module_plan.md');
  if (!fs.existsSync(planPath)) {
    return { ok: false, module: mod, note: '07_module_plan.md missing — module scope unproven' };
  }
  const plan = fs.readFileSync(planPath, 'utf8');
  const present = plan.toLowerCase().includes(mod.toLowerCase());
  return {
    ok: present,
    module: mod,
    note: present ? null : `module "${mod}" not found in 07_module_plan.md`,
  };
}

function checkEco(fitBlock, promptText) {
  const eco = field(fitBlock, 'eco_invariants') || '';
  const issues = [];
  if (/secret/i.test(promptText) && /localStorage/i.test(promptText)) {
    issues.push('possible secret+storage smell in prompt — review');
  }
  return { ok: issues.length === 0, eco_invariants: eco, issues };
}

function writeEvidence(outRoot, data, root = process.cwd()) {
  const dir = path.join(outRoot, 'evidence');
  fs.mkdirSync(dir, { recursive: true });
  const name = data.evidence_name
    ? data.evidence_name
    : data.change_id
    ? `CHANGE-${data.change_id}.json`
    : data.d
    ? `${data.d}.json`
    : 'RELEASE.json';
  const dest = path.join(dir, name);
  const sealed = seal(root, data);
  fs.writeFileSync(dest, JSON.stringify(sealed, null, 2), 'utf8');
  console.log(`Wrote ${dest}`);
  return dest;
}

/** Кто создал акт: SP_AGENT, иначе git user.email. Нужно, чтобы review не писал сам автор. */
function producerId(root) {
  if (process.env.SP_AGENT && process.env.SP_AGENT.trim()) return process.env.SP_AGENT.trim();
  const r = spawnSync('git', ['config', 'user.email'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 && (r.stdout || '').trim() ? r.stdout.trim() : null;
}

/**
 * Путь из артефакта: понимается и от корня проекта, и от `OUTPUT`, и с префиксом `OUTPUT/`.
 * Один резолвер на все ссылки — трейс, approval, evidence_refs.
 */
function resolveAny(root, outRoot, ref) {
  const rel = String(ref || '');
  const candidates = [
    path.resolve(root, rel),
    path.resolve(root, 'witness-done', rel),
    path.join(outRoot, rel.replace(/^OUTPUT\//, '')),
    path.resolve(outRoot, rel),
  ];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

function verifyEvidenceGate(args, outRoot) {
  if (!args.verifyEvidence) {
    console.error('--verify-evidence требует путь к акту: OUTPUT/evidence/D03.json');
    return 1;
  }
  // Путь понимается и от корня проекта, и от OUTPUT: `evidence/D03.json` тоже верно.
  const rel = args.verifyEvidence;
  const candidates = [
    path.resolve(args.root, rel),
    path.resolve(args.root, 'witness-done', rel),
    path.join(outRoot, rel.replace(/^OUTPUT\//, '')),
  ];
  const found = candidates.find((c) => fs.existsSync(c)) || candidates[0];
  const r = verifyEvidenceFile(args.root, found);
  console.log(JSON.stringify(r, null, 2));
  if (!r.ok) for (const i of r.issues) console.error(`FAIL ${i}`);
  return r.ok ? 0 : 2;
}

const TRACE_TYPES = ['api_response', 'console_log', 'screenshot'];

/**
 * Runtime trace для L3: артефакт производится снаружи (preview-окружения у фабрики нет).
 * Проверяется форма, целостность и привязка к коду — не порождение (DEC-019).
 * Каждый `ref` обязан существовать, `commit`/`code_hash` — совпадать с текущим деревом.
 */
function traceCheck(root, outRoot, d, required, produces = []) {
  const name = `${d}.trace.json`;
  const file = path.join(outRoot, 'evidence', name);
  const out = { required, ok: !required, file: `evidence/${name}`, hash: null, entries: 0, issues: [] };
  if (!required) return out;
  if (!fs.existsSync(file)) {
    out.issues.push(`нет evidence/${name} (runtime_trace_required: yes)`);
    out.ok = false;
    return out;
  }
  out.hash = sha256(fs.readFileSync(file));
  let t;
  try {
    t = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    out.issues.push(`evidence/${name} не читается как JSON: ${e.message}`);
    out.ok = false;
    return out;
  }
  if (String(t.d || '').toUpperCase() !== String(d).toUpperCase()) {
    out.issues.push(`evidence/${name}: d «${t.d || '—'}» не совпадает с ${d}`);
  }
  // Привязка к коду: трейс без commit не говорит, что именно исполнялось.
  const head = gitHead(root);
  if (!t.commit || !String(t.commit).trim()) {
    out.issues.push(`evidence/${name}: commit пуст — какой код исполнялся, неизвестно`);
  } else {
    out.commit = String(t.commit).trim();
    if (!head) {
      out.issues.push(`evidence/${name}: git недоступен — привязку commit проверить нельзя`);
    } else if (!String(head).startsWith(out.commit)) {
      out.issues.push(`evidence/${name}: commit ${out.commit.slice(0, 7)} != HEAD ${head.slice(0, 7)} — трейс от другого кода`);
    }
  }
  if (!t.code_hash || typeof t.code_hash !== 'object') {
    out.issues.push(`evidence/${name}: code_hash отсутствует — трейс не привязан к содержимому PRODUCES`);
  } else {
    out.code_hash = t.code_hash;
    const want = codeHash(root, produces);
    if (!t.code_hash.produces_digest && !t.code_hash.git_tree) {
      out.issues.push(`evidence/${name}: code_hash пуст — ни produces_digest, ни git_tree`);
    } else if (produces.length) {
      if (!t.code_hash.produces_digest) {
        out.issues.push(`evidence/${name}: code_hash.produces_digest пуст, а у задания есть PRODUCES`);
      } else if (t.code_hash.produces_digest !== want.produces_digest) {
        out.issues.push(`evidence/${name}: трейс снят на другом коде — produces_digest не совпадает`);
      }
    } else if (t.code_hash.git_tree && want.git_tree && t.code_hash.git_tree !== want.git_tree) {
      out.issues.push(`evidence/${name}: трейс снят на другом дереве — git_tree не совпадает`);
    }
  }
  if (!t.captured_at || Number.isNaN(Date.parse(t.captured_at))) {
    out.issues.push(`evidence/${name}: captured_at не ISO-8601`);
  }
  if (!t.source || !String(t.source).trim()) out.issues.push(`evidence/${name}: source пуст`);
  const entries = Array.isArray(t.entries) ? t.entries : [];
  out.entries = entries.length;
  if (!entries.length) out.issues.push(`evidence/${name}: entries пуст (нужна ≥1 запись)`);
  entries.forEach((e, i) => {
    const at = `entries[${i}]`;
    if (!TRACE_TYPES.includes(e && e.type)) out.issues.push(`${at}: type «${e && e.type}» не из ${TRACE_TYPES.join('|')}`);
    if (!e || !e.ref || !String(e.ref).trim()) {
      out.issues.push(`${at}: ref пуст`);
      return;
    }
    const ref = String(e.ref);
    const found = resolveAny(root, outRoot, ref) || resolveAny(root, outRoot, path.join('evidence', ref));
    if (!found) out.issues.push(`${at}: ref «${ref}» не существует`);
    else if (e.sha256 && fileDigest(found) !== e.sha256) out.issues.push(`${at}: sha256 «${ref}» не совпадает`);
  });
  out.ok = out.issues.length === 0;
  return out;
}

/** Пустая ячейка: шаблонные заполнители не считаются содержанием. */
function blankCell(v) {
  const s = String(v ?? '').trim();
  return !s || /^(—|-|…|\.\.\.|todo|tbd|n\/a)$/i.test(s);
}

function sectionBody(text, name) {
  const re = new RegExp(`^##\\s*${name}\\s*$`, 'im');
  const m = text.match(re);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = text.slice(start);
  const end = rest.search(/^##\s+/m);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

/**
 * Минимальная полнота spec-packet: четыре вопроса, без которых задача — не задача.
 * Полный формат не требуется: это и есть смысл Lite-режима.
 */
function verifySpecPacket(args, outRoot) {
  const id = args.intake;
  const issues = [];
  if (!id) {
    console.error('--gate spec-packet требует --intake <ID>');
    return 1;
  }
  const dir = path.join(args.root, 'journal', 'intake');
  const file = path.join(dir, `${id}-packet.md`);
  if (!fs.existsSync(file)) {
    const alt = fs.existsSync(path.join(outRoot, 'intake', `${id}-packet.md`));
    console.error(`Нет ${path.relative(args.root, file)}${alt ? ' (пакет лежит в OUTPUT/intake — перенеси в journal/)' : ''}`);
    return 2;
  }
  const text = fs.readFileSync(file, 'utf8');
  const goal = sectionBody(text, 'Цель');
  if (goal === null) issues.push('нет секции ## Цель');
  else if (blankCell(goal)) issues.push('## Цель пуста');

  const nonGoals = sectionBody(text, 'Non-goals');
  if (nonGoals === null) issues.push('нет секции ## Non-goals');
  else {
    const items = nonGoals.split('\n').map((l) => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
    if (!items.length || items.every(blankCell)) issues.push('## Non-goals пуст');
  }

  const criteria = sectionBody(text, 'Критерии приёмки');
  if (criteria === null) issues.push('нет секции ## Критерии приёмки');
  else {
    const rows = criteria.split('\n').filter((l) => /^\|\s*A\d+/.test(l));
    const filled = rows.filter((l) => {
      const cells = l.split('|').slice(1, -1);
      return cells.length >= 2 && !blankCell(cells[1]);
    });
    if (filled.length < 3) issues.push(`## Критерии приёмки: заполнено ${filled.length}, нужно ≥3`);
  }

  const evidence = sectionBody(text, 'Evidence');
  if (evidence === null) issues.push('нет секции ## Evidence');
  else {
    const items = evidence.split('\n').map((l) => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
    if (!items.length || items.every(blankCell)) issues.push('## Evidence пуст');
  }

  if (!fs.existsSync(path.join(dir, `${id}.md`))) {
    issues.push(`нет записи входа journal/intake/${id}.md (пакет без входа не существует)`);
  }

  const tax_pass = issues.length === 0;
  console.log(JSON.stringify({ intake: id, gate: 'spec-packet', file: path.relative(args.root, file), tax_pass, issues }, null, 2));
  if (!tax_pass) for (const i of issues) console.error(`FAIL ${i}`);
  return tax_pass ? 0 : 2;
}

function verifyPreCi(args, outRoot) {
  if (!args.d) {
    console.error('--d required for pre_ci');
    return 1;
  }
  const prompt = findPrompt(outRoot, args.d);
  if (!prompt) {
    console.error(`Prompt for ${args.d} not found in OUTPUT/prompts`);
    return 1;
  }
  const fit = section(prompt.text, 'FIT_CHECKS');
  const tax = section(prompt.text, 'VERIFICATION_TAX');
  const level = parseLevel(tax);
  const produces = listProduces(prompt.text);
  const acceptance = parseAcceptanceIds(prompt.text);

  const scopes = { unit: false, module: false, app: false, eco: false };
  const commands = [];
  const structural = { acceptance_ok: true, issues: [] };
  const fitMeta = {
    ops_checked: [],
    acceptance_ids: acceptance.ids,
    acceptance_source: 'prompt',
    depends_done: [],
    conflicts_applied: parseList(field(fit, 'conflicts_applied')),
    out_of_produces: [],
    missing_produces: [],
    produces,
  };
  const conflictsRef = field(fit, 'conflicts_ref') || '';
  if (conflictsRef && !/^(none|—|-|нет)$/i.test(conflictsRef)) {
    fitMeta.conflicts_ref = conflictsRef;
    if (fitMeta.conflicts_applied.length === 0) {
      fitMeta.conflicts_note = 'conflicts_ref set but conflicts_applied is empty';
    }
  } else if (!conflictsRef) {
    // Поле необязательно: его отсутствие означает «конфликтов нет», а не «поле забыли».
    // До v1.24 пустая строка считалась заданным полем и задание падало на ровном месте.
    fitMeta.conflicts_ref = 'none (поле не указано)';
  }

  // Acceptance contract (v1.10): те же пороги, что в d-prompt-quality — L1 ≥3, L2/L3 6–12.
  if (level !== 'L0') {
    const { min, max } = acceptanceThreshold(level);
    if (acceptance.na) {
      structural.acceptance_ok = false;
      fitMeta.acceptance_ids = [];
      fitMeta.acceptance_note = acceptance.note;
      structural.issues.push(`ACCEPTANCE N/A forbidden for ${level}`);
      console.error(`Acceptance fail: ACCEPTANCE N/A forbidden for ${level}`);
    } else if (acceptance.ids.length < min) {
      structural.acceptance_ok = false;
      structural.issues.push(
        `ACCEPTANCE has ${acceptance.ids.length} ids, ${level} requires ≥${min}`,
      );
      console.error(`Acceptance fail: ${structural.issues[structural.issues.length - 1]}`);
    } else if (acceptance.ids.length > max) {
      structural.acceptance_ok = false;
      structural.issues.push(
        `ACCEPTANCE has ${acceptance.ids.length} ids, ${level} allows ≤${max}`,
      );
      console.error(`Acceptance fail: ${structural.issues[structural.issues.length - 1]}`);
    }
    fitMeta.acceptance_min = min;
    fitMeta.acceptance_max = Number.isFinite(max) ? max : null;
  } else {
    fitMeta.acceptance_ids = acceptance.ids;
    if (acceptance.na) fitMeta.acceptance_note = acceptance.note;
  }

  // conflicts: каждый blocker из 07_conflicts.md должен быть применён в FIT_CHECKS
  const conflicts = conflictBlockers(outRoot);
  if (conflicts.file) {
    fitMeta.conflicts_ref_file = conflicts.file;
    fitMeta.conflicts_blockers = conflicts.blockers;
    const applied = fitMeta.conflicts_applied.map((x) => x.toLowerCase());
    const missingConflicts = conflicts.blockers.filter(
      (b) => !applied.some((a) => a.includes(b.toLowerCase())),
    );
    if (missingConflicts.length) {
      structural.issues.push(
        `${conflicts.file}: blockers not applied in conflicts_applied — ${missingConflicts.join(', ')}`,
      );
      console.error(`Conflicts: ${structural.issues[structural.issues.length - 1]}`);
    }
  }

  // Инварианты проекта: каталог один, применение — детерминированным селектором (module + уровень).
  const modField = (field(fit, 'module') || '').trim();
  const moduleName = /^(none|—|-|нет)$/i.test(modField) ? null : modField;
  const invSel = selectInvariants(outRoot, { module: moduleName, level });
  const invRefs = [
    ...new Set((section(prompt.text, 'INVARIANTS').match(/INV-\d+/g) || []).map((x) => x.toUpperCase())),
  ];
  const invSkipRaw = (field(fit, 'invariants_skip') || '').trim();
  const invSkipReason = invSkipRaw && !/^(none|—|-|нет)$/i.test(invSkipRaw) ? invSkipRaw : null;
  fitMeta.invariants = {
    catalog: invSel.file,
    catalog_exists: invSel.exists,
    module: moduleName,
    selected: invSel.selected.map((i) => i.id),
    referenced: invRefs,
    waived: [],
    skip_reason: invSkipReason,
    issues: [],
  };
  if (invSel.exists) {
    const known = new Set(invSel.items.map((i) => i.id));
    for (const ref of invRefs) {
      if (!known.has(ref)) fitMeta.invariants.issues.push(`${ref} не объявлен в ${invSel.file}`);
    }
    if (!invSkipReason) {
      for (const inv of invSel.selected) {
        const w = waiverState(inv);
        if (w.expired) {
          fitMeta.invariants.issues.push(`${inv.id}: waiver истёк ${inv.waiver.until}`);
        } else if (w.active) {
          fitMeta.invariants.waived.push({ id: inv.id, reason: inv.waiver.reason, until: inv.waiver.until });
        } else if (!invRefs.includes(inv.id)) {
          fitMeta.invariants.issues.push(`${inv.id} не упомянут в ## INVARIANTS задания`);
        }
      }
    } else {
      fitMeta.invariants.skipped = invSel.selected.map((i) => i.id);
    }
    for (const i of fitMeta.invariants.issues) {
      structural.issues.push(`invariants: ${i}`);
      console.error(`Invariants: ${i}`);
    }
  }

  // unit: commands
  if (args.skipCommands || level === 'L0') {
    scopes.unit = true;
  } else {
    const cmds = loadVerifyCommands(outRoot);
    for (const key of ['lint', 'typecheck', 'test']) {
      const r = runCmd(cmds[key], args.root);
      commands.push({ cmd: r.cmd, exit: r.exit });
      if (r.exit !== 0) {
        console.error(`Command failed: ${r.cmd} (exit ${r.exit})`);
      }
    }
    scopes.unit = commands.every((c) => c.exit === 0);
  }

  // produces exist (relative to root) — hard fail for coded levels. Glob проверяется наличием файлов.
  let producesOk = true;
  for (const p of produces) {
    if (p.startsWith('OUTPUT/')) continue;
    const abs = path.join(args.root, p);
    if (/[*?]/.test(p)) {
      if (level === 'L0') continue;
      const re = globToRe(p.replace(/^\.\//, ''));
      if (!walkFiles(args.root, p).some((f) => re.test(f))) {
        producesOk = false;
        fitMeta.missing_produces.push(p);
      }
      continue;
    }
    if (!fs.existsSync(abs) && level !== 'L0') {
      producesOk = false;
      fitMeta.missing_produces.push(p);
    }
  }
  if (!producesOk) {
    const msg = `missing PRODUCES: ${fitMeta.missing_produces.join(', ')}`;
    structural.issues.push(msg);
    console.error(msg);
  }

  // out_of_produces: факт для чтения. Теперь это подмножество proof_debt — провал объясняется списком.
  const outside = diffAgainstProduces(args.root, produces);
  if (outside.ok) fitMeta.out_of_produces = outside.files;
  else fitMeta.out_of_produces_note = outside.note;

  // Plan-to-Proof: заявлено vs тронуто. Неоплаченный налог — файлы вне PRODUCES.
  const plan = planToProof(args.root, produces, args.base, {
    otherDeclared: collectOtherProduces(outRoot, args.d),
  });
  fitMeta.plan = plan;
  if (level !== 'L0') {
    if (!plan.ok) {
      structural.issues.push(`plan: ${plan.note} (для ${level} это провал, а не пропуск)`);
      console.error(`Plan: ${structural.issues[structural.issues.length - 1]}`);
    } else if (plan.proof_debt.length) {
      structural.issues.push(
        `proof_debt: ${plan.proof_debt.length} файл(ов) тронуты, но не заявлены в PRODUCES — ${plan.proof_debt.join(', ')}`,
      );
      console.error(`Plan: ${structural.issues[structural.issues.length - 1]}`);
    }
  }

  // L0 — docs-only. До v1.24 объявление L0 снимало все проверки: произвольный код проходил
  // pre_ci без тестов, приёмки и ревью — одна строка отменяла налог. Теперь L0 проверяется
  // на то, чем он обязан быть: ни одного файла кода (DEC-024).
  if (level === 'L0') {
    const codeProduces = produces.filter(isCodeFile);
    if (codeProduces.length) {
      structural.issues.push(`L0 не может производить код: ${codeProduces.join(', ')} — подними уровень`);
    }
    const codeTouched = (plan.ok ? plan.proof_debt : []).filter(isCodeFile);
    if (codeTouched.length) {
      structural.issues.push(
        `L0 с изменённым кодом: ${codeTouched.join(', ')} — docs/config-only уровень не покрывает код`,
      );
    }
    if (!acceptance.na && acceptance.ids.length === 0) {
      structural.issues.push('L0: ACCEPTANCE пуст — нужен N/A с причиной или хотя бы один Axx');
    }
    for (const i of structural.issues.filter((x) => x.startsWith('L0'))) console.error(`L0: ${i}`);
  }

  // Runtime trace: для L3 обязателен по умолчанию, отключение — только явным `no`.
  const traceRaw = (field(fit, 'runtime_trace_required') || '').trim();
  const traceRequired =
    level === 'L3'
      ? !/^(no|false|нет|0)$/i.test(traceRaw)
      : /^(yes|true|да|1)$/i.test(traceRaw);
  const trace = traceCheck(args.root, outRoot, args.d, traceRequired, produces);
  if (traceRequired) {
    for (const i of trace.issues) {
      structural.issues.push(`trace: ${i}`);
      console.error(`Trace: ${i}`);
    }
  }

  const mod = checkModule(outRoot, fit);
  scopes.module = mod.ok || level === 'L0';
  if (!mod.ok && level !== 'L0') {
    structural.issues.push(mod.note);
    console.error(`Module: ${mod.note}`);
  }

  const deps = checkDepsDone(outRoot, fit);
  fitMeta.depends_done = deps.depends;
  const app = checkAppContracts(outRoot, fit, level);
  fitMeta.ops_checked = app.ops_checked || [];
  if (!app.ok) {
    const msg = app.note || 'app contracts fail';
    structural.issues.push(msg);
    console.error(`App contracts: ${msg}`);
  }
  scopes.app = deps.ok && app.ok;
  if (!deps.ok) {
    structural.issues.push(`depends not done: ${(deps.notDone || []).join(', ')}`);
    console.error(
      `Depends: ${(deps.notDone || []).join(', ')} — не done${deps.reason ? ` (${deps.reason})` : ''}`,
    );
  }
  if (fitMeta.conflicts_note) {
    structural.issues.push(fitMeta.conflicts_note);
    console.error(`Conflicts: ${fitMeta.conflicts_note}`);
  }

  const eco = checkEco(fit, prompt.text);
  scopes.eco = eco.ok;
  if (!eco.ok) {
    structural.issues.push(...eco.issues);
    for (const i of eco.issues) console.error(`Eco: ${i}`);
  }

  /**
   * Связь «фраза приёмки ↔ тест» (DEC-027). До v1.27 проверялось только наличие теста и
   * зелёный прогон: тест про что угодно закрывал любую фразу. Теперь фраза должна быть
   * объявлена тестом (`@acceptance A01.k` или ID в имени), тест — содержать утверждение,
   * не быть пропущенным и быть заявленным в PRODUCES задания.
   */
  let binding = null;
  if (level !== 'L0' && !acceptance.na) {
    const exempt = parseList(field(fit, 'acceptance_ops'));
    binding = bindAcceptance({
      root: args.root,
      promptText: prompt.text,
      produces,
      exemptIds: exempt,
    });
    fitMeta.acceptance_binding = {
      ok: binding.ok,
      bound_ids: binding.bound_ids,
      unbound: binding.unbound,
      phantom: binding.phantom,
      hollow: binding.hollow,
      skipped: binding.skipped,
      exempt: binding.exempt,
      phrase_missing: binding.phrase_missing,
      files: binding.files_scanned,
      binding_hash: binding.binding_hash,
    };
    for (const i of binding.issues) {
      structural.issues.push(`acceptance: ${i}`);
      console.error(`Acceptance binding: ${i}`);
    }
    if (!binding.ok) structural.acceptance_ok = false;
    if (binding.phrase_missing.length) {
      // Фраза без текста связывается только по номеру: ссылка есть, смысла в ней нет.
      fitMeta.acceptance_binding.note =
        `у фраз ${binding.phrase_missing.join(', ')} нет текста в таблице ACCEPTANCE — проверь Given/When/Then`;
    }
  }

  // L3 human gate: GATE field must explicitly require human confirmation
  const gateRaw = (prompt.text.match(/^GATE:\s*(.+)$/im) || [])[1] || '';
  const humanGateOk =
    level !== 'L3' || (/human|человек/i.test(gateRaw) && !/\|/.test(gateRaw));
  if (!humanGateOk) {
    const msg = 'L3 requires GATE: human confirm before coding';
    structural.issues.push(msg);
    console.error(msg);
  }

  // level requirements
  let required = ['unit'];
  if (level === 'L1') required = ['unit', 'module', 'app'];
  if (level === 'L2' || level === 'L3') required = ['unit', 'module', 'app', 'eco'];
  if (level === 'L0') required = [];

  // review-артефакт: для L2+ акт обязан быть кем-то прочитан, а не только посчитан
  const review = { required: level === 'L2' || level === 'L3', ok: true, issues: [] };
  if (review.required) {
    const current = {
      producer: producerId(args.root),
      code_hash: codeHash(args.root, produces),
      fit: { acceptance_ids: fitMeta.acceptance_ids },
    };
    const rc = reviewCheck(args.root, outRoot, args.d, current);
    review.ok = rc.ok;
    review.verdict = rc.review ? rc.review.verdict || null : null;
    review.reviewer = rc.review ? rc.review.reviewer || null : null;
    review.file = `evidence/${args.d}.review.json`;
    review.issues = rc.issues;
    for (const i of rc.issues) structural.issues.push(`review: ${i}`);
    if (!rc.ok) {
      console.error(`Review fail: ${rc.issues[0]} (затем: sp review ${args.d} --verdict supports)`);
    }
  }

  const tax_pass =
    required.every((s) => scopes[s]) &&
    producesOk &&
    structural.acceptance_ok &&
    structural.issues.length === 0;
  const evidence = {
    d: args.d,
    level,
    gate: 'pre_ci',
    producer: producerId(args.root),
    // Прогон без команд — законная быстрая итерация, но он обязан быть виден в акте:
    // иначе release не отличит проверенный акт от структурного (DEC-024).
    commands_skipped: Boolean(args.skipCommands || level === 'L0'),
    scopes,
    fit: fitMeta,
    commands,
    module: mod,
    app,
    eco,
    structural_ok: structural.issues.length === 0,
    issues: structural.issues,
    deps,
    structural,
    trace,
    review,
    tax_pass,
    timestamp: new Date().toISOString(),
  };
  writeEvidence(outRoot, evidence, args.root);
  console.log(
    JSON.stringify(
      { tax_pass, scopes, level, acceptance_ids: fitMeta.acceptance_ids, ops_checked: fitMeta.ops_checked },
      null,
      2,
    ),
  );
  return tax_pass ? 0 : 2;
}

function budgetRow(block, key) {
  const line = block
    .split('\n')
    .find((l) => new RegExp(`^\\|\\s*${key}\\s*\\|`, 'i').test(l));
  if (!line) return null;
  return line.split('|').slice(2, -1).join('|').trim();
}

/**
 * Гейт `acceptance` — независимая проверка связи «фраза ↔ тест» по всем заданиям.
 * Нужен там, где `pre_ci` уже прошёл: на шаге 09 (перед волной), шаге 10 и в ревью.
 * Проверяет больше, чем pre_ci: требует текст фразы и согласие test-plan с исходниками.
 */
function verifyAcceptance(args, outRoot) {
  const dir = path.join(outRoot, 'prompts');
  if (!fs.existsSync(dir)) {
    console.error('OUTPUT/prompts not found');
    return 1;
  }
  const prompts = fs
    .readdirSync(dir)
    .filter((f) => /^D\d+.*\.md$/i.test(f))
    .sort()
    .map((f) => ({ file: f, d: (f.match(/^D\d+/) || [f])[0] }));

  const targets = args.d ? prompts.filter((p) => p.d.toUpperCase() === String(args.d).toUpperCase()) : prompts;
  if (targets.length === 0) {
    console.error(`Нет задания ${args.d} в OUTPUT/prompts`);
    return 1;
  }

  const results = [];
  for (const t of targets) {
    const text = fs.readFileSync(path.join(dir, t.file), 'utf8');
    const level = parseLevel(section(text, 'VERIFICATION_TAX'));
    const issues = [];
    const parsed = parseAcceptancePhrases(text);

    if (level === 'L0' || parsed.na) {
      results.push({ d: t.d, level, na: true, ok: true, issues });
      continue;
    }

    // Фраза должна быть текстом, а не номером: связывать «A01.3» не с чем.
    for (const row of parsed.rows) {
      if (row.phraseMissing) issues.push(`${row.id}: нет текста фразы в таблице ACCEPTANCE`);
    }

    const fit = section(text, 'FIT_CHECKS');
    const binding = bindAcceptance({
      root: args.root,
      promptText: text,
      produces: listProduces(text),
      exemptIds: parseList(field(fit, 'acceptance_ops')),
    });
    for (const i of binding.issues) issues.push(i);

    const plan = checkTestPlan(outRoot, t.d, binding);
    for (const i of plan.issues) issues.push(i);

    results.push({
      d: t.d,
      level,
      na: false,
      ok: issues.length === 0,
      phrases: binding.phrases.map((p) => ({
        id: p.id,
        digest: p.digest,
        tests: p.tests.map((x) => `${x.file}::${x.test}`),
        exempt: p.exempt,
        satisfied: p.satisfied,
      })),
      binding_hash: binding.binding_hash,
      test_plan: plan.file,
      files: binding.files_scanned,
      issues,
    });
    for (const i of issues) console.error(`${t.d}: ${i}`);
  }

  const tax_pass = results.every((r) => r.ok);
  const single = Boolean(args.d);
  const evidence = {
    gate: 'acceptance',
    checked: results.map((r) => r.d),
    results,
    tax_pass,
    timestamp: new Date().toISOString(),
  };
  writeEvidence(
    outRoot,
    single ? { ...evidence, d: results[0].d, evidence_name: `ACCEPTANCE-${results[0].d}.json` } : { ...evidence, evidence_name: 'ACCEPTANCE.json' },
    args.root,
  );
  console.log(JSON.stringify({ tax_pass, checked: evidence.checked, failed: results.filter((r) => !r.ok).map((r) => r.d) }, null, 2));
  return tax_pass ? 0 : 2;
}

function verifyDPromptQuality(args, outRoot) {
  const dir = path.join(outRoot, 'prompts');
  if (!fs.existsSync(dir)) {
    console.error('OUTPUT/prompts not found');
    return 1;
  }
  const all = fs
    .readdirSync(dir)
    .filter((f) => /^D\d+.*\.md$/i.test(f))
    .sort();
  if (all.length === 0) {
    console.error('No D prompts found in OUTPUT/prompts');
    return 1;
  }
  const BATCH = 5;
  const batchNo = Number.isInteger(args.batch) && args.batch > 0 ? args.batch : 1;
  const slice = all.slice((batchNo - 1) * BATCH, batchNo * BATCH);
  if (slice.length === 0) {
    console.error(`Batch ${batchNo} is empty (${all.length} prompts, max 5 per batch)`);
    return 1;
  }

  const results = [];
  for (const f of slice) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const d = (f.match(/^D\d+/) || [f])[0];
    const level = parseLevel(section(text, 'VERIFICATION_TAX'));
    const issues = [];

    // L3 заявляет внешний контур — поле трейса должно быть названо, а не выведено по умолчанию.
    if (level === 'L3' && !/\|\s*runtime_trace_required\s*\|/i.test(text)) {
      issues.push('L3: FIT_CHECKS обязан явно указать runtime_trace_required (yes | no) — иначе трасса контура не определена');
    }

    // HOW
    const how = section(text, 'HOW').replace(/<!--[\s\S]*?-->/g, '').trim();
    if (level === 'L0') {
      if (!/^N\/A\s*[—\-]\s*\S/i.test(how)) issues.push('HOW must be "N/A — <reason>" for L0');
    } else if (how.length < 40 || /^1\.\s*…/m.test(how)) {
      issues.push('HOW missing or still a placeholder (What+How steps required)');
    }

    // INVARIANTS
    const inv = section(text, 'INVARIANTS');
    const invCount = (inv.match(/^\s*\d+\.\s+\S/gim) || []).length;
    if (level === 'L0') {
      if (invCount < 1 && !/N\/A/i.test(inv)) issues.push('INVARIANTS: L0 allows N/A, not empty');
    } else if (invCount < 5) {
      issues.push(`INVARIANTS has ${invCount} bullets, canon requires 5–12`);
    } else if (invCount > 12) {
      issues.push(`INVARIANTS has ${invCount} bullets, canon allows ≤12`);
    }

    // ACCEPTANCE
    const acc = parseAcceptanceIds(text);
    const minAcc = level === 'L2' || level === 'L3' ? 6 : 3;
    const maxAcc = level === 'L2' || level === 'L3' ? 12 : Infinity;
    if (level === 'L0') {
      if (!acc.na) issues.push('ACCEPTANCE must be N/A for L0');
    } else if (acc.na) {
      issues.push(`ACCEPTANCE N/A forbidden for ${level}`);
    } else if (acc.ids.length < minAcc) {
      issues.push(`ACCEPTANCE has ${acc.ids.length} ids, ${level} requires ≥${minAcc}`);
    } else if (acc.ids.length > maxAcc) {
      issues.push(`ACCEPTANCE has ${acc.ids.length} ids, ${level} allows ≤${maxAcc}`);
    }
    // Axx prefix must match D number
    const expected = d.replace(/^D/i, 'A');
    const wrong = acc.ids.filter((id) => !id.toUpperCase().startsWith(expected.toUpperCase() + '.'));
    if (wrong.length) issues.push(`ACCEPTANCE ids not prefixed ${expected}.*: ${wrong.join(', ')}`);

    // Фраза должна быть текстом: номер без текста нечем связать с тестом (DEC-027).
    if (level !== 'L0' && !acc.na) {
      const phrases = parseAcceptancePhrases(text);
      const noText = phrases.rows.filter((r) => r.phraseMissing).map((r) => r.id);
      if (noText.length) {
        issues.push(`ACCEPTANCE: у ${noText.join(', ')} нет текста фразы — связь с тестом не проверить`);
      }
    }

    // SIZE_BUDGET
    const budget = section(text, 'SIZE_BUDGET');
    const sizeOk = (budgetRow(budget, 'size_ok') || '').toLowerCase();
    const producesCount = parseInt(budgetRow(budget, 'produces_count') || '', 10);
    const surfacesRaw = budgetRow(budget, 'surfaces') || '';
    const surfaces = surfacesRaw.split('|').map((s) => s.trim()).filter(Boolean);
    if (sizeOk !== 'yes') issues.push(`SIZE_BUDGET size_ok must be "yes" (got "${sizeOk || 'missing'}")`);
    if (!budgetRow(budget, 'delivery_slice')) issues.push('SIZE_BUDGET delivery_slice missing (Sx)');
    if (!Number.isFinite(producesCount)) issues.push('SIZE_BUDGET produces_count missing');
    else if (producesCount > 6) issues.push(`SIZE_BUDGET produces_count ${producesCount} > 6 — split required`);
    if (surfaces.length > 2) issues.push(`SIZE_BUDGET surfaces ${surfaces.length} > 2 — split required`);

    // PRODUCES actual non-test files ≤6
    const produces = listProduces(text).filter((p) => !/\/(test|tests|__tests__)\//i.test(p) && !/\.test\.|\.spec\./i.test(p));
    if (produces.length > 6) issues.push(`PRODUCES has ${produces.length} non-test files > 6 — split required`);

    // CONTEXT_PACK
    const pack = section(text, 'CONTEXT_PACK');
    const packPath = (budgetRow(pack, 'pack_path') || '').replace(/`/g, '');
    const validation = (budgetRow(pack, 'validation_ok') || '').toLowerCase();
    const retrieveQuery = (budgetRow(pack, 'retrieve_query') || '').toLowerCase();
    const isNone = retrieveQuery === 'none' || packPath === 'none';
    if (!isNone) {
      if (!packPath) issues.push('CONTEXT_PACK pack_path missing');
      else {
        const abs = path.join(outRoot, packPath.replace(/^OUTPUT\//i, ''));
        if (!fs.existsSync(abs)) issues.push(`CONTEXT_PACK pack missing: ${packPath}`);
      }
      if (!validation.startsWith('yes')) issues.push('CONTEXT_PACK validation_ok must be "yes"');
    }

    // Ярлыки неполноты: объём нельзя подменять «степенью готовности»
    // (catalogs/completeness-policy.md). Цитаты с запретом/OUT OF SCOPE не считаются.
    const labels = findIncompletenessLabels(text);
    for (const l of labels) {
      issues.push(`ярлык неполноты «${l.why}» в строке ${l.line} — объём описывается полной комплектацией (S0…S8 — порядок работ): ${l.text}`);
    }

    // placeholders left in prompt
    if (level !== 'L0' && /\[Dxx_name\]|\[platform \||\{\{[A-Z_]+\}\}/.test(text)) {
      issues.push('unresolved template placeholders remain');
    }

    results.push({ d, file: f, level, size_ok: sizeOk === 'yes', acceptance_ids: acc.ids, issues });
    if (issues.length) console.error(`${d}: ${issues.join('; ')}`);
  }

  const failed = results.filter((r) => r.issues.length > 0);
  const tax_pass = failed.length === 0;
  const evidence = {
    gate: 'd-prompt-quality',
    batch: batchNo,
    batch_size: slice.length,
    batches_total: Math.ceil(all.length / BATCH),
    prompts_total: all.length,
    checked: results.map((r) => r.d),
    results,
    tax_pass,
    timestamp: new Date().toISOString(),
  };
  writeEvidence(outRoot, { ...evidence, evidence_name: `prompt-quality-batch-${batchNo}.json` }, args.root);
  console.log(
    JSON.stringify(
      { tax_pass, batch: batchNo, checked: evidence.checked, failed: failed.map((f) => f.d) },
      null,
      2,
    ),
  );
  return tax_pass ? 0 : 2;
}

function findSmokeScript(root) {
  const candidates = [
    'scripts/smoke/product-smoke.sh',
    'scripts/smoke/product-smoke.mjs',
    'scripts/smoke/product-smoke.py',
    'scripts/smoke/local-product-smoke.sh',
    'scripts/smoke/local-product-smoke.py',
    'witness-done/OUTPUT/scripts/smoke/product-smoke.sh',
  ];
  return candidates.map((c) => path.join(root, c)).find((p) => fs.existsSync(p)) || null;
}

/** Задания со статусом `done` из progress.md: нужны смоуку и релизу для атрибуции. */
function doneFromProgress(outRoot) {
  const p = path.join(outRoot, 'roadmaps', 'progress.md');
  if (!fs.existsSync(p)) return [];
  return parseProgress(fs.readFileSync(p, 'utf8'))
    .rows.filter((r) => r.status === 'done')
    .map((r) => r.id);
}

function verifyProductSmoke(args, outRoot) {
  const issues = [];
  const runbookCandidates = [
    path.join(outRoot, 'docs', 'runbooks', 'product-smoke.md'),
    path.join(args.root, 'docs', 'runbooks', 'product-smoke.md'),
  ];
  const runbook = runbookCandidates.find((p) => fs.existsSync(p));
  if (!runbook) issues.push('missing docs/runbooks/product-smoke.md');

  const script = findSmokeScript(args.root);
  if (!script) issues.push('missing scripts/smoke/product-smoke.* (no product smoke script)');

  // Атрибуция: прогон доказывает фразы, только если проверки названы их номерами (DEC-020).
  const labels = [];
  let uncovered = [];
  if (script) {
    const text = fs.readFileSync(script, 'utf8');
    for (const m of text.matchAll(/\bA\d{2,}\.\d+\b/g)) {
      const id = m[0].toUpperCase();
      if (!labels.includes(id)) labels.push(id);
    }
    if (!labels.length) {
      issues.push('smoke script не помечает проверки номерами Axx.k — прогон ничего не доказывает');
    }
    const accepted = new Set();
    for (const d of doneFromProgress(outRoot)) {
      const ev = path.join(outRoot, 'evidence', `${d}.json`);
      if (!fs.existsSync(ev)) continue;
      try {
        const j = JSON.parse(fs.readFileSync(ev, 'utf8'));
        for (const id of (j.fit && j.fit.acceptance_ids) || []) accepted.add(String(id).toUpperCase());
      } catch {
        /* битый акт поймает другой гейт */
      }
    }
    if (accepted.size) {
      const covered = labels.filter((id) => accepted.has(id));
      uncovered = [...accepted].filter((id) => !labels.includes(id));
      if (!covered.length) {
        issues.push('smoke script не метит ни одну принятую Axx — атрибуции нет');
      }
    }
  }

  const commands = [];
  if (script && !args.skipCommands) {
    const cmd = script.endsWith('.py')
      ? `python3 ${path.relative(args.root, script)}`
      : script.endsWith('.mjs')
      ? `node ${path.relative(args.root, script)}`
      : `bash ${path.relative(args.root, script)}`;
    const r = runCmd(cmd, args.root);
    commands.push({ cmd: r.cmd, exit: r.exit });
    if (r.exit !== 0) issues.push(`product smoke failed: ${cmd} (exit ${r.exit})`);
  }

  const tax_pass = issues.length === 0;
  const evidence = {
    gate: 'product-smoke',
    runbook: runbook ? path.relative(args.root, runbook) : null,
    script: script ? path.relative(args.root, script) : null,
    // Привязка акта к содержимому скрипта: после правки скрипта старый акт недействителен.
    script_sha256: script ? fileDigest(script) : null,
    commands_skipped: Boolean(args.skipCommands),
    commands,
    // Что именно прогон подтвердил: метки из скрипта, пересечённые с принятыми Axx
    runtime: { labels, uncovered_acceptance: uncovered },
    issues,
    tax_pass,
    timestamp: new Date().toISOString(),
  };
  writeEvidence(outRoot, { ...evidence, evidence_name: 'RELEASE-product-smoke.json' }, args.root);
  console.log(JSON.stringify(evidence, null, 2));
  return tax_pass ? 0 : 2;
}

function evidenceFiles(outRoot) {
  const dir = path.join(outRoot, 'evidence');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
}

function verifySelfAudit(outRoot, root = process.cwd()) {
  const issues = [];
  const mode = runMode(outRoot);
  const coveragePath = path.join(outRoot, 'roadmaps', 'coverage-matrix.md');
  const exitCandidates = [
    path.join(outRoot, 'docs', 'exit-criteria.md'),
    path.join(outRoot, 'roadmaps', 'exit-criteria.md'),
  ];
  const exitPath = exitCandidates.find((p) => fs.existsSync(p));
  const progressPath = path.join(outRoot, 'roadmaps', 'progress.md');

  // 1. coverage matrix: every row must map to a D (в lite не требуется)
  if (mode === 'lite') {
    // lite: coverage-matrix и exit-criteria не обязательны; progress + акты — обязательны
  } else if (!fs.existsSync(coveragePath)) issues.push('missing roadmaps/coverage-matrix.md');
  else {
    const rows = fs
      .readFileSync(coveragePath, 'utf8')
      .split('\n')
      .filter((l) => /^\|/.test(l) && !/^\|\s*[-: ]+\|/.test(l));
    const dataRows = rows.filter((l) => !/^\|\s*(requirement|требование|id|metric)\b/i.test(l));
    const unmapped = dataRows.filter((l) => !/\bD\d+\b/.test(l));
    if (dataRows.length === 0) issues.push('coverage-matrix has no requirement rows');
    if (unmapped.length) issues.push(`coverage-matrix: ${unmapped.length} row(s) without D id — 100% trace required`);
  }

  // 2. exit criteria E1..En with evidence (в lite не требуется)
  if (mode === 'lite') {
    // см. п.1
  } else if (!exitPath) issues.push('missing docs/exit-criteria.md (E1…En with evidence)');
  else {
    const text = fs.readFileSync(exitPath, 'utf8');
    const ids = [...new Set([...text.matchAll(/\bE(\d{1,3})\b/g)].map((m) => `E${m[1]}`))];
    if (ids.length === 0) issues.push('exit-criteria.md has no E<n> criteria');
    const rows = text
      .split('\n')
      .filter((l) => /^\|\s*E\d+\s*\|/.test(l));
    const noEvidence = rows.filter((l) => {
      const cells = l.split('|').slice(2, -1);
      const ev = (cells[cells.length - 1] || '').trim();
      return !ev || /^—$|^-$|todo|tbd/i.test(ev);
    });
    if (rows.length && noEvidence.length) {
      issues.push(`exit-criteria: ${noEvidence.length} criterion row(s) without evidence`);
    }
  }

  // 3. done D rows must have evidence with acceptance ids (L1+)
  if (!fs.existsSync(progressPath)) issues.push('missing roadmaps/progress.md');
  else {
    const evidence = evidenceFiles(outRoot);
    const pr = parseProgress(fs.readFileSync(progressPath, 'utf8'));
    for (const i of pr.issues) issues.push(`progress.md: ${i}`);
    if (!pr.rows.length) issues.push('progress.md: ни одной строки задания');
    for (const row of pr.rows) {
      if (row.status !== 'done') continue;
      const d = row.id;
      const ref = evidence.find((f) => f.toLowerCase() === `${d.toLowerCase()}.json`);
      if (!ref) {
        issues.push(`${d} marked done but evidence/${d}.json is missing`);
        continue;
      }
      let ev;
      try {
        ev = JSON.parse(fs.readFileSync(path.join(outRoot, 'evidence', ref), 'utf8'));
      } catch (e) {
        issues.push(`${d}: evidence/${d}.json не читается (${e.message})`);
        continue;
      }
      const level = ev.level || 'L1';
      if (level !== 'L0' && !(ev.tax_pass && (ev.fit?.acceptance_ids || []).length)) {
        issues.push(`${d} evidence has tax_pass!=true or empty acceptance_ids`);
      }
      // Самодиагностика смотрит на тот же акт, что и релиз: печать и привязка к коду.
      for (const i of verifyEvidenceFile(root, path.join(outRoot, 'evidence', `${d}.json`)).issues) {
        issues.push(`${d}: ${i}`);
      }
      // Акт не может остаться от другой редакции задания: Axx сверяются с промптом.
      const match = acceptanceMatchesPrompt(outRoot, d, ev);
      if (!match.ok && !match.skip) issues.push(`${d} stale evidence: ${match.note}`);
    }
  }

  const tax_pass = issues.length === 0;
  const evidence = {
    gate: 'self-audit',
    mode,
    issues,
    tax_pass,
    timestamp: new Date().toISOString(),
  };
  writeEvidence(outRoot, { ...evidence, evidence_name: 'SELF_AUDIT.json' }, root);
  console.log(JSON.stringify(evidence, null, 2));
  return tax_pass ? 0 : 2;
}

function verifyBaseline(args, outRoot) {
  const specDir = findSpecStateDir(args.root, args.factory);
  const baselineDir = path.join(specDir, 'baseline');
  const configPath = path.join(specDir, 'config.yaml');
  const issues = [];
  const domains = [];

  if (!fs.existsSync(configPath)) issues.push('missing spec-state/config.yaml');
  if (!fs.existsSync(baselineDir)) {
    issues.push('missing spec-state/baseline/ — run R01 first');
  } else {
    for (const ent of fs.readdirSync(baselineDir, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const domain = ent.name;
      const specPath = path.join(baselineDir, domain, 'spec.md');
      if (!fs.existsSync(specPath)) {
        issues.push(`${domain}: missing baseline/${domain}/spec.md`);
        continue;
      }
      const reqs = extractRequirements(fs.readFileSync(specPath, 'utf8'));
      if (reqs.length === 0) issues.push(`${domain}: no requirements found`);
      let scenarios = 0;
      for (const req of reqs) {
        if (!/\b(MUST|SHALL)\b/i.test(req.content)) {
          issues.push(`${domain} / "${req.name}": missing MUST or SHALL`);
        }
        const count = (req.content.match(/^####\s+Scenario:/gim) || []).length;
        scenarios += count;
        if (count < 2) {
          issues.push(
            `${domain} / "${req.name}": ${count} scenario(s), ≥2 required (happy path + negative/boundary)`,
          );
        } else if (
          !hasNegativeScenario(req.content)
        ) {
          issues.push(`${domain} / "${req.name}": no negative/boundary scenario`);
        }
        const blocks = req.content.split(/^####\s+Scenario:/im).slice(1);
        blocks.forEach((b, i) => {
          if (!/\bGIVEN\b/i.test(b) || !/\bWHEN\b/i.test(b) || !/\bTHEN\b/i.test(b)) {
            issues.push(`${domain} / "${req.name}": scenario #${i + 1} missing GIVEN/WHEN/THEN`);
          }
        });
      }
      domains.push({ domain, requirements: reqs.length, scenarios });
    }
    if (domains.length === 0) issues.push('baseline has no domain directories');
  }

  const tax_pass = issues.length === 0;
  const evidence = {
    gate: 'baseline',
    domains,
    issues,
    tax_pass,
    timestamp: new Date().toISOString(),
  };
  writeEvidence(outRoot, { ...evidence, evidence_name: 'BASELINE.json' }, args.root);
  console.log(JSON.stringify(evidence, null, 2));
  return tax_pass ? 0 : 2;
}

function verifyPreRelease(outRoot, root = process.cwd()) {
  const mode = runMode(outRoot);
  const progressPath = path.join(outRoot, 'roadmaps', 'progress.md');
  const coveragePath = path.join(outRoot, 'roadmaps', 'coverage-matrix.md');
  const conflictsPath = path.join(outRoot, 'docs', '07_conflicts.md');
  const issues = [];

  const doneIds = [];
  if (!fs.existsSync(progressPath)) issues.push('missing progress.md');
  else {
    const pr = parseProgress(fs.readFileSync(progressPath, 'utf8'));
    for (const i of pr.issues) issues.push(`progress.md: ${i}`);
    if (!pr.rows.length) issues.push('progress.md: ни одной строки задания — релизить нечего');
    const evidDir = path.join(outRoot, 'evidence');
    for (const row of pr.rows) {
      const id = row.id;
      if (row.status !== 'done') {
        issues.push(`${id} status=${row.status}`);
        continue;
      }
      doneIds.push(id);
      const ep = path.join(evidDir, `${id}.json`);
      if (!fs.existsSync(ep)) {
        issues.push(`done ${id} without evidence`);
        continue;
      }
      let j;
      try {
        j = JSON.parse(fs.readFileSync(ep, 'utf8'));
      } catch {
        issues.push(`evidence ${id} invalid json`);
        continue;
      }
      if (!j.tax_pass) issues.push(`evidence ${id} tax_pass=false`);
      const lvl = (j.level || '').toUpperCase();
      // Структурный прогон (--skip-commands) не равен проверенному: релиз его не принимает (DEC-024).
      // Исключение — L0: там команд нет по определению уровня, и это не «пропуск».
      if (j.commands_skipped === true && lvl !== 'L0') {
        issues.push(`done ${id}: акт снят без команд (--skip-commands) — линт/типы/тесты не гонялись`);
      }
      if (lvl && lvl !== 'L0') {
        const ids = j.fit?.acceptance_ids;
        const na = j.fit?.acceptance_note && /N\/A/i.test(String(j.fit.acceptance_note));
        if (!na && (!Array.isArray(ids) || ids.length === 0)) {
          issues.push(`done ${id} evidence missing acceptance_ids`);
        }
      }
      const match = acceptanceMatchesPrompt(outRoot, id, j);
      if (!match.ok && !match.skip) issues.push(`done ${id} stale evidence: ${match.note}`);
      // Связь «фраза ↔ тест» перепроверяется на текущем дереве: тест могли удалить или
      // переименовать после приёмки, а фразу — переписать под уже написанный тест (DEC-027).
      const bindCheck = acceptanceBindingStillValid(root, outRoot, id, j);
      if (!bindCheck.skip) {
        for (const i of bindCheck.issues) issues.push(`done ${id}: ${i}`);
      }
      // Целостность акта: подмена байтов, правка кода после приёмки, чистота акта в git
      const sealed = verifyEvidenceFile(root, path.join(outRoot, 'evidence', `${id}.json`));
      for (const i of sealed.issues) issues.push(`done ${id}: ${i}`);
      // L2/L3 без review не считается принятым
      if (lvl === 'L2' || lvl === 'L3') {
        const rc = reviewCheck(root, outRoot, id, { ...j, producer: j.producer });
        if (!rc.ok) for (const i of rc.issues) issues.push(`done ${id}: review — ${i}`);
      }
      if ((lvl === 'L2' || lvl === 'L3') && (!j.fit?.ops_checked || j.fit.ops_checked.length === 0)) {
        issues.push(`done ${id} L2/L3 evidence ops_checked empty`);
      }
    }
  }

  if (mode === 'lite') {
    // lite: coverage-matrix не обязательна, акт и progress остаются обязательными
  } else if (fs.existsSync(coveragePath)) {
    const c = fs.readFileSync(coveragePath, 'utf8');
    if (/\|\s*missing\s*\|/i.test(c) || /\bmissing\b/i.test(c)) {
      // only flag if P0 mentioned with missing — soft check
      if (/P0[^\n]*missing|missing[^\n]*P0/i.test(c) || /\|\s*P0\s*\|[^\n]*\|\s*missing\s*\|/i.test(c)) {
        issues.push('coverage-matrix has P0 missing');
      }
    }
  } else issues.push('missing coverage-matrix.md');

  if (fs.existsSync(conflictsPath)) {
    const conf = fs.readFileSync(conflictsPath, 'utf8');
    // Строка за строкой: упоминание «blocker» и «open» в разных абзацах не значит,
    // что блокер открыт — раньше гейт падал на слове, а не на факте.
    const openRows = conf
      .split('\n')
      .filter((l) => /^\|/.test(l))
      .filter((l) => /blocker/i.test(l))
      .filter(
        (l) =>
          /(?:\bopen\b|\bunresolved\b|открыт)/i.test(l) &&
          !/(?:\bclosed\b|\bresolved\b|закрыт)/i.test(l),
      );
    if (openRows.length) {
      issues.push(`07_conflicts.md: ${openRows.length} строк(и) с открытым blocker — решение обязательно`);
    }
  }

  // Runtime-контур: если приняты задания с кодом, релиз без смоук-прогона не проходит (DEC-021).
  const hasRuntimeCode = doneIds.some((id) => {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(outRoot, 'evidence', `${id}.json`), 'utf8'));
      return ((j.fit && j.fit.produces) || []).length > 0;
    } catch {
      return false;
    }
  });
  let smoke = { required: hasRuntimeCode, ok: true, file: 'evidence/RELEASE-product-smoke.json', issues: [] };
  if (hasRuntimeCode) {
    const smokePath = path.join(outRoot, 'evidence', 'RELEASE-product-smoke.json');
    if (!fs.existsSync(smokePath)) {
      smoke.ok = false;
      smoke.issues.push('нет акта product-smoke — релиз с runtime-кодом без прогона контура 3');
    } else {
      // Акт релиза проверяется так же, как акт задания: печать, привязка, содержимое.
      // До v1.24 хватало `{"tax_pass": true}` — 18 байт вместо прогона (DEC-024).
      const sealedSmoke = verifyEvidenceFile(root, smokePath);
      for (const i of sealedSmoke.issues) smoke.issues.push(i);
      if (!sealedSmoke.ok) smoke.ok = false;
      let s = null;
      try {
        s = JSON.parse(fs.readFileSync(smokePath, 'utf8'));
      } catch (e) {
        smoke.ok = false;
        smoke.issues.push(`RELEASE-product-smoke.json не читается: ${e.message}`);
      }
      if (s) {
        if (s.tax_pass !== true) {
          smoke.ok = false;
          smoke.issues.push('акт product-smoke с tax_pass=false');
        }
        if (s.commands_skipped === true) {
          smoke.ok = false;
          smoke.issues.push('смоук снят без исполнения (--skip-commands)');
        }
        if (!s.code_hash) {
          smoke.ok = false;
          smoke.issues.push('акт смоука без code_hash — не привязан к коду');
        }
        const labels = s.runtime && Array.isArray(s.runtime.labels) ? s.runtime.labels : [];
        if (!labels.length) {
          smoke.ok = false;
          smoke.issues.push('акт смоука без runtime.labels — нечем подтвердить фразы Axx');
        }
        const script = findSmokeScript(root);
        // Удалённый после прогона скрипт — тоже устаревший акт: доказательство ссылается на файл,
        // которого больше нет. Отсутствие привязки не должно означать «проверять нечего» (DEC-024).
        const recordedScript = s.script ? String(s.script) : null;
        if (!script && recordedScript) {
          smoke.ok = false;
          smoke.issues.push(`смоук-скрипт ${recordedScript} из акта не найден — акт устарел`);
        }
        if (script) {
          const digest = fileDigest(script);
          const recorded = s.script_sha256 || null;
          if (!recorded) {
            smoke.ok = false;
            smoke.issues.push('акт смоука не привязан к скрипту (нет script_sha256) — перепрогони product-smoke');
          } else if (digest && recorded !== digest) {
            smoke.ok = false;
            smoke.issues.push('смоук-скрипт изменён после прогона — акт устарел, перепрогони product-smoke');
          }
        }
        smoke.runtime = s.runtime || null;
        smoke.code_hash = s.code_hash || null;
        smoke.script_sha256 = s.script_sha256 || null;
      }
    }
    for (const i of smoke.issues) issues.push(`smoke: ${i}`);
  }

  // План рантайма, если он есть, обязан быть исполнен, а не только описан (DEC-022).
  let runtime = { required: fs.existsSync(path.join(outRoot, 'runtime', 'runtime-plan.json')), ok: true, issues: [] };
  if (runtime.required) {
    const actPath = path.join(outRoot, 'evidence', 'RELEASE-runtime-verify.json');
    if (!fs.existsSync(actPath)) {
      runtime.ok = false;
      runtime.issues.push('нет акта RELEASE-runtime-verify.json — план есть, верификация в рантайме не прогонялась');
    } else {
      const sealedAct = verifyEvidenceFile(root, actPath);
      for (const i of sealedAct.issues) runtime.issues.push(i);
      if (!sealedAct.ok) runtime.ok = false;
      let a = null;
      try {
        a = JSON.parse(fs.readFileSync(actPath, 'utf8'));
      } catch (e) {
        runtime.ok = false;
        runtime.issues.push(`RELEASE-runtime-verify.json не читается: ${e.message}`);
      }
      if (a) {
        if (a.executed !== true) {
          runtime.ok = false;
          runtime.issues.push('план проверен статически, но не исполнен');
        }
        if (a.tax_pass !== true) {
          runtime.ok = false;
          runtime.issues.push('акт runtime с tax_pass=false');
        }
        if (!Array.isArray(a.verify) || a.verify.length === 0) {
          runtime.ok = false;
          runtime.issues.push('акт runtime без списка verify — нечего подтверждать');
        }
        if (!Array.isArray(a.down) || a.down.length === 0) {
          runtime.ok = false;
          runtime.issues.push('акт runtime без teardown (down) — контур мог остаться поднятым');
        }
        // Акт привязан к редакции плана: правка плана после прогона обнуляет доказательство.
        const planAbs = path.join(outRoot, PLAN_REL);
        const planDigest = fileDigest(planAbs);
        if (!a.plan_hash) {
          runtime.ok = false;
          runtime.issues.push('акт runtime без plan_hash — не привязан к плану');
        } else if (planDigest && a.plan_hash !== planDigest) {
          runtime.ok = false;
          runtime.issues.push('план изменён после прогона — акт устарел, перепрогони --gate runtime');
        }
        runtime.plan_hash = a.plan_hash || null;
        runtime.covered = (a.verify || []).filter((v) => v.ok).map((v) => v.acceptance);
        runtime.na = (a.na || []).map((n) => n.acceptance);
        runtime.uncovered = a.uncovered || [];
        if (runtime.uncovered.length) {
          runtime.ok = false;
          runtime.issues.push(`не покрыты принятые фразы: ${runtime.uncovered.join(', ')}`);
        }
      }
    }
    for (const i of runtime.issues) issues.push(`runtime: ${i}`);
  }

  const tax_pass = issues.length === 0;
  const evidence = {
    d: null,
    gate: 'pre_release',
    mode,
    tax_pass,
    issues,
    smoke,
    runtime,
    coverage_confidence: coverageConfidence(root, outRoot, [...new Set(doneIds)]),
    timestamp: new Date().toISOString(),
  };
  writeEvidence(outRoot, evidence, root);
  console.log(JSON.stringify(evidence, null, 2));
  return tax_pass ? 0 : 2;
}

function findSpecStateDir(root, factory) {
  const cands = [
    path.join(root, 'spec-state'),
    path.join(factory, 'spec-state'),
    path.join(root, 'witness-done', 'spec-state'),
  ];
  for (const c of cands) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(root, 'spec-state');
}

function splitH2Sections(text) {
  const sections = {};
  const regex = /^##\s+(.+)$/gm;
  let match;
  const indices = [];
  while ((match = regex.exec(text)) !== null) {
    indices.push({ title: match[1].trim(), index: match.index, end: match.index + match[0].length });
  }
  for (let i = 0; i < indices.length; i++) {
    const cur = indices[i];
    const nextIndex = (i + 1 < indices.length) ? indices[i + 1].index : text.length;
    const body = text.slice(cur.end, nextIndex);
    sections[cur.title] = body;
  }
  return sections;
}

/**
 * Негативный или граничный сценарий по заголовку `#### Scenario:` (DEC-032).
 * Канон требует русские тексты, поэтому словарь двуязычный: «Неверный пароль» и
 * «Ошибка записи» — такие же негативные кейсы, как `negative`/`boundary`.
 * Один помощник для baseline и дельты: правило не должно расходиться между гейтами.
 */
const NEGATIVE_SCENARIO = new RegExp(
  '^####\\s+Scenario:[^\\n]*(' +
    [
      'negative',
      'boundary',
      'invalid',
      'error',
      'fail',
      'denied',
      'forbidden',
      'timeout',
      'empty',
      'missing',
      'негатив',
      'границ',
      'отказ',
      'ошибк',
      'неверн',
      'недоступ',
      'неудач',
      'провал',
      'запрет',
      'некоррект',
      'невалид',
      'пуст',
      'таймаут',
      'лимит',
    ].join('|') +
    ')',
  'im',
);

function hasNegativeScenario(content) {
  return NEGATIVE_SCENARIO.test(content);
}

function extractRequirements(body) {
  const reqs = [];
  const reqRegex = /^###\s+(?:Requirement|Требование)?[:\s]*(.+)$/gim;
  let match;
  const indices = [];
  while ((match = reqRegex.exec(body)) !== null) {
    indices.push({ name: match[1].trim(), index: match.index, end: match.index + match[0].length });
  }
  for (let i = 0; i < indices.length; i++) {
    const cur = indices[i];
    const nextIndex = (i + 1 < indices.length) ? indices[i + 1].index : body.length;
    const content = body.slice(cur.end, nextIndex);
    reqs.push({ name: cur.name, content });
  }
  return reqs;
}

function extractBaselineReqNames(text) {
  const names = new Set();
  const reqRegex = /^###\s+(?:Requirement|Требование)?[:\s]*(.+)$/gim;
  let match;
  while ((match = reqRegex.exec(text)) !== null) {
    names.add(match[1].trim().toLowerCase());
  }
  return names;
}

function parseTasks(text) {
  const lines = text.split('\n');
  let total = 0;
  let completed = 0;
  for (const line of lines) {
    if (/^[-*]\s+\[\s*\]/.test(line.trim())) {
      total++;
    } else if (/^[-*]\s+\[[xX]\]/.test(line.trim())) {
      total++;
      completed++;
    }
  }
  return { total, completed, allDone: total > 0 && total === completed };
}

function verifyChange(args, outRoot) {
  if (!args.change) {
    console.error('--change <id> is required for gate change');
    return 1;
  }
  const specDir = findSpecStateDir(args.root, args.factory);
  const changeDir = path.join(specDir, 'changes', args.change);
  const baselineDir = path.join(specDir, 'baseline');

  const issues = [];
  const deltaIssues = [];
  const commands = [];
  let deltaValid = true;
  let tasksCompleted = false;

  if (!fs.existsSync(changeDir)) {
    issues.push(`Change directory not found: ${changeDir}`);
    deltaIssues.push(`Change directory not found: ${changeDir}`);
    deltaValid = false;
  } else {
    // 1. Check tasks.md
    const tasksPath = path.join(changeDir, 'tasks.md');
    if (!fs.existsSync(tasksPath)) {
      issues.push('missing tasks.md in change package');
    } else {
      const taskText = fs.readFileSync(tasksPath, 'utf8');
      const taskStats = parseTasks(taskText);
      if (taskStats.total === 0) {
        issues.push('tasks.md contains no task checkboxes (- [ ])');
      } else if (!taskStats.allDone) {
        issues.push(`tasks.md has uncompleted tasks (${taskStats.completed}/${taskStats.total})`);
      } else {
        tasksCompleted = true;
      }
    }

    // 1b. proposal.md + explicit backwards compatibility declaration
    const proposalPath = path.join(changeDir, 'proposal.md');
    if (!fs.existsSync(proposalPath)) {
      issues.push('missing proposal.md in change package');
      deltaIssues.push('missing proposal.md in change package');
    } else {
      const proposal = fs.readFileSync(proposalPath, 'utf8');
      const h2 = proposal.split(/\n(?=## )/);
      /**
       * Заголовок ищется с явным кириллическим классом (DEC-036): `\w` в JS не покрывает
       * кириллицу, поэтому `обратн\w*\s+совместим` не совпадал с «Обратная совместимость»,
       * и proposal по-русски (как требует R02 и language-policy) валился на ровном месте.
       */
      const compatSection = h2.find((s) =>
        /backwards?\s+compatibility|обратн[\wА-Яа-яЁё-]*\s+совместим|совместимост/i.test(
          s.split('\n')[0],
        ),
      );
      if (!compatSection) {
        deltaIssues.push('proposal.md missing "Backwards Compatibility" section');
      } else {
        const body = compatSection
          .replace(/^##[^\n]*\n/, '')
          .replace(/<!--[\s\S]*?-->/g, '')
          .trim();
        if (body.length < 20) {
          deltaIssues.push('Backwards Compatibility section is empty — state impact explicitly');
        } else if (!/breaking|несовместим|совместим|no impact|не влияет|compatib/i.test(body)) {
          deltaIssues.push(
            'Backwards Compatibility must state breaking | compatible | no impact explicitly',
          );
        }
      }
    }

    // 1c. baseline must exist before a change can be validated against it
    if (!fs.existsSync(baselineDir)) {
      issues.push('missing spec-state/baseline — run R00 reverse-engineer first');
      deltaIssues.push('missing spec-state/baseline');
    }

    // 2. Check specs delta
    const specsDir = path.join(changeDir, 'specs');
    if (!fs.existsSync(specsDir)) {
      issues.push('missing specs/ directory in change package');
      deltaIssues.push('missing specs/ directory in change package');
      deltaValid = false;
    } else {
      const specFiles = fs.readdirSync(specsDir).filter((f) => f.endsWith('.md'));
      if (specFiles.length === 0) {
        issues.push('no delta spec markdown files found in specs/');
        deltaIssues.push('no delta spec markdown files found in specs/');
        deltaValid = false;
      }

      for (const sf of specFiles) {
        const domain = path.basename(sf, '.md');
        const specPath = path.join(specsDir, sf);
        const specContent = fs.readFileSync(specPath, 'utf8');
        const sections = splitH2Sections(specContent);

        let addedText = '';
        let modText = '';
        let remText = '';
        for (const [title, body] of Object.entries(sections)) {
          if (/ADDED\s+Requirements/i.test(title)) addedText = body;
          else if (/MODIFIED\s+Requirements/i.test(title)) modText = body;
          else if (/REMOVED\s+Requirements/i.test(title)) remText = body;
        }

        const baseSpecPath = path.join(baselineDir, domain, 'spec.md');
        let baselineReqs = new Set();
        if (fs.existsSync(baseSpecPath)) {
          baselineReqs = extractBaselineReqNames(fs.readFileSync(baseSpecPath, 'utf8'));
        }

        const addedReqs = extractRequirements(addedText);
        for (const req of addedReqs) {
          if (!/\b(MUST|SHALL)\b/i.test(req.content)) {
            deltaIssues.push(`[${sf}] ADDED requirement "${req.name}" missing MUST or SHALL`);
          }
          if (!/\bGIVEN\b/i.test(req.content) || !/\bWHEN\b/i.test(req.content) || !/\bTHEN\b/i.test(req.content)) {
            deltaIssues.push(`[${sf}] ADDED requirement "${req.name}" missing GIVEN/WHEN/THEN scenario`);
          }
          const scCount = (req.content.match(/^####\s+Scenario:/gim) || []).length;
          if (scCount < 2) {
            deltaIssues.push(
              `[${sf}] ADDED requirement "${req.name}" has ${scCount} scenario(s), ≥2 required (happy + negative/boundary)`,
            );
          } else if (!hasNegativeScenario(req.content)) {
            deltaIssues.push(`[${sf}] ADDED requirement "${req.name}" has no negative/boundary scenario`);
          }
        }

        const modReqs = extractRequirements(modText);
        for (const req of modReqs) {
          if (!/\b(MUST|SHALL)\b/i.test(req.content)) {
            deltaIssues.push(`[${sf}] MODIFIED requirement "${req.name}" missing MUST or SHALL`);
          }
          if (!/\bGIVEN\b/i.test(req.content) || !/\bWHEN\b/i.test(req.content) || !/\bTHEN\b/i.test(req.content)) {
            deltaIssues.push(`[${sf}] MODIFIED requirement "${req.name}" missing GIVEN/WHEN/THEN scenario`);
          }
          const scCount = (req.content.match(/^####\s+Scenario:/gim) || []).length;
          if (scCount < 2) {
            deltaIssues.push(
              `[${sf}] MODIFIED requirement "${req.name}" has ${scCount} scenario(s), ≥2 required (happy + negative/boundary)`,
            );
          } else if (!hasNegativeScenario(req.content)) {
            deltaIssues.push(`[${sf}] MODIFIED requirement "${req.name}" has no negative/boundary scenario`);
          }
          if (!baselineReqs.has(req.name.toLowerCase())) {
            deltaIssues.push(`[${sf}] MODIFIED requirement "${req.name}" not found in baseline spec for domain "${domain}"`);
          }
        }

        const remReqs = extractRequirements(remText);
        for (const req of remReqs) {
          if (!req.content.trim()) {
            deltaIssues.push(`[${sf}] REMOVED requirement "${req.name}" has no removal justification`);
          }
          if (!baselineReqs.has(req.name.toLowerCase())) {
            deltaIssues.push(`[${sf}] REMOVED requirement "${req.name}" not found in baseline spec for domain "${domain}"`);
          }
        }

        if (addedReqs.length === 0 && modReqs.length === 0 && remReqs.length === 0) {
          deltaIssues.push(`[${sf}] no ADDED, MODIFIED, or REMOVED requirements found in delta`);
        }
      }

      if (deltaIssues.length > 0) {
        deltaValid = false;
        for (const i of deltaIssues) if (!issues.includes(i)) issues.push(i);
      }
    }

    // consolidate issues raised outside the specs/ branch
    if (deltaIssues.length > 0) {
      deltaValid = false;
      for (const i of deltaIssues) if (!issues.includes(i)) issues.push(i);
    }
  }

  // 2c. approval для L3: подтверждает человек с ролью, не автор изменения
  const approval = { required: false, ok: true, issues: [] };
  if (fs.existsSync(changeDir)) {
    const proposalPath = path.join(changeDir, 'proposal.md');
    const proposalText = fs.existsSync(proposalPath) ? fs.readFileSync(proposalPath, 'utf8') : '';
    const lvl = (proposalText.match(/\|\s*(?:level|уровень)\s*\|\s*(L[0-3])\s*\|/i) || [])[1];
    const changeLevel = lvl ? lvl.toUpperCase() : null;
    approval.level = changeLevel;
    if (changeLevel === 'L3') {
      approval.required = true;
      const ap = path.join(changeDir, 'approval.json');
      const producer = producerId(args.root);
      if (!fs.existsSync(ap)) {
        approval.issues.push('L3 requires approval.json (approved_by, role, timestamp, evidence_refs)');
      } else {
        let a = null;
        try {
          a = JSON.parse(fs.readFileSync(ap, 'utf8'));
        } catch (e) {
          approval.issues.push(`approval.json не читается: ${e.message}`);
        }
        if (a) {
          if (!a.approved_by || !String(a.approved_by).trim()) approval.issues.push('approval.json: approved_by пуст');
          if (!a.role || !String(a.role).trim()) approval.issues.push('approval.json: role пуст');
          if (!a.timestamp || Number.isNaN(Date.parse(a.timestamp))) {
            approval.issues.push('approval.json: timestamp не ISO-8601');
          }
          if (!Array.isArray(a.evidence_refs) || a.evidence_refs.length === 0) {
            approval.issues.push('approval.json: evidence_refs пуст — подтверждение без доказательств');
          } else {
            for (const ref of a.evidence_refs) {
              if (!resolveAny(args.root, outRoot, ref)) {
                approval.issues.push(`approval.json: evidence_ref «${ref}» не существует`);
              }
            }
          }
          if (producer && a.approved_by && String(a.approved_by).trim() === producer) {
            approval.issues.push(`approval.json: approved_by совпадает с автором изменения (${producer})`);
          }
          approval.approved_by = a.approved_by || null;
          approval.role = a.role || null;
        }
      }
      approval.ok = approval.issues.length === 0;
      for (const i of approval.issues) issues.push(`approval: ${i}`);
    }
  }

  // 3. Run commands
  let commandsOk = true;
  if (!args.skipCommands) {
    const cmds = loadVerifyCommands(outRoot);
    for (const key of ['lint', 'typecheck', 'test']) {
      const r = runCmd(cmds[key], args.root);
      commands.push({ cmd: r.cmd, exit: r.exit });
      if (r.exit !== 0) {
        commandsOk = false;
        issues.push(`Command failed: ${r.cmd} (exit ${r.exit})`);
      }
    }
  }

  const tax_pass = deltaValid && tasksCompleted && commandsOk && issues.length === 0;

  const evidence = {
    change_id: args.change,
    gate: 'change',
    schema_version: 1,
    delta_valid: deltaValid,
    tasks_completed: tasksCompleted,
    commands_skipped: Boolean(args.skipCommands),
    commands,
    approval,
    issues,
    tax_pass,
    timestamp: new Date().toISOString(),
  };

  writeEvidence(outRoot, evidence, args.root);
  console.log(JSON.stringify(evidence, null, 2));
  return tax_pass ? 0 : 2;
}

/**
 * Сверка `progress.md` ↔ `evidence/`: узкий гейт, который не подменяет `pre_release`.
 * Вопрос ровно один: каждому `done` — акт, каждому акту — строка, статус и акт согласованы.
 * До v1.24 это был псевдоним `pre_release`: имя обещало одно, акт писался другой.
 */
function evidenceSync(outRoot, root) {
  const issues = [];
  const progressPath = path.join(outRoot, 'roadmaps', 'progress.md');
  const evDir = path.join(outRoot, 'evidence');
  const pr = fs.existsSync(progressPath)
    ? parseProgress(fs.readFileSync(progressPath, 'utf8'))
    : { rows: [], issues: ['нет roadmaps/progress.md'] };
  for (const i of pr.issues) issues.push(`progress.md: ${i}`);
  const acts = fs.existsSync(evDir)
    ? fs
        .readdirSync(evDir)
        .filter((f) => /^D\d+\.json$/i.test(f))
        .map((f) => f.replace(/\.json$/i, ''))
    : [];
  const rows = new Map(pr.rows.map((r) => [r.id, r.status]));
  for (const [id, status] of rows) {
    const has = acts.some((a) => idOf(a) === id);
    if (status === 'done' && !has) issues.push(`${id}: done без акта evidence/${id}.json`);
    if (status !== 'done' && has) {
      const v = verifyEvidenceFile(root, path.join(evDir, `${id}.json`));
      if (v.tax_pass) {
        issues.push(`${id}: акт с tax_pass=true, а статус ${status} — рассинхрон progress ↔ evidence`);
      }
    }
  }
  for (const a of acts) {
    if (!rows.has(idOf(a))) issues.push(`evidence/${a}.json без строки в progress.md`);
  }
  const evidence = {
    gate: 'evidence-sync',
    rows: pr.rows.length,
    acts: acts.length,
    issues,
    tax_pass: issues.length === 0,
    timestamp: new Date().toISOString(),
  };
  writeEvidence(outRoot, { ...evidence, evidence_name: 'EVIDENCE_SYNC.json' }, root);
  console.log(JSON.stringify(evidence, null, 2));
  return evidence.tax_pass ? 0 : 2;
}

/**
 * План рантайма: статическая проверка (`--gate runtime-plan`) или исполнение (`--gate runtime`).
 * Исполнение — то, что отличает «план есть» от «план сработал»: up → ready → seed → verify → down.
 */
async function verifyRuntime(args, outRoot) {
  /**
   * Два разных гейта с двумя разными актами (DEC-035). До v1.31 `--gate runtime-plan` исполнял
   * план: статика включалась только `--skip-commands`, а канон и PIPELINE/08 велят запускать
   * гейт без флага. В результате «проверил план» поднимало окружение, гоняло verify[] и писало
   * акт исполнения, который `pre_release` принимал за доказанный прогон.
   */
  const staticOnly = args.gate === 'runtime-plan' || args.skipCommands;
  const gateName = staticOnly ? 'runtime-plan' : 'runtime';
  const evidenceName = staticOnly ? 'RELEASE-runtime-plan.json' : 'RELEASE-runtime-verify.json';
  const finish = (payload) => {
    const evidence = {
      gate: gateName,
      plan: PLAN_REL,
      executed: false,
      ...payload,
      timestamp: new Date().toISOString(),
    };
    writeEvidence(outRoot, { ...evidence, evidence_name: evidenceName }, args.root);
    console.log(JSON.stringify(evidence, null, 2));
    return evidence.tax_pass ? 0 : 2;
  };

  const loaded = loadPlan(outRoot);
  const issues = [...loaded.issues];
  if (!loaded.required) {
    return finish({
      required: false,
      issues: [...issues, `нет ${PLAN_REL} — подъём рантайма и верификация не зафиксированы`],
      tax_pass: false,
    });
  }
  if (loaded.read_error) return finish({ issues, tax_pass: false });

  const stat = checkPlan(args.root, outRoot, loaded.plan);
  issues.push(...stat.issues);

  // Статический гейт не исполняет план ни при каких флагах.
  if (staticOnly) {
    return finish({
      stack: loaded.plan.stack || [],
      planned: stat.coverage.covered.map((c) => c.acceptance),
      na: stat.coverage.na.map((c) => c.acceptance),
      uncovered: stat.coverage.uncovered.map((u) => u.acceptance),
      issues,
      tax_pass: issues.length === 0,
    });
  }

  // План неисполним — исполнение не начинаем: неверная команда не должна трогать окружение.
  if (stat.issues.length) return finish({ issues, tax_pass: false });

  const evidence = await executePlan(args.root, outRoot, loaded.plan, { budgetMin: args.budgetMin });
  writeEvidence(outRoot, { ...evidence, evidence_name: evidenceName }, args.root);
  console.log(JSON.stringify(evidence, null, 2));
  return evidence.tax_pass ? 0 : 2;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    help();
    process.exit(0);
  }
  const outRoot = outputDir(args.root, args.factory);
  if (args.verifyEvidence) process.exit(verifyEvidenceGate(args, outRoot));
  if (args.gate === 'spec-packet') process.exit(verifySpecPacket(args, outRoot));
  if (args.gate === 'change') process.exit(verifyChange(args, outRoot));
  if (args.gate === 'pre_release') process.exit(verifyPreRelease(outRoot, args.root));
  if (args.gate === 'evidence-sync') process.exit(evidenceSync(outRoot, args.root));
  if (args.gate === 'pre_ci') process.exit(verifyPreCi(args, outRoot));
  if (args.gate === 'd-prompt-quality') process.exit(verifyDPromptQuality(args, outRoot));
  if (args.gate === 'acceptance') process.exit(verifyAcceptance(args, outRoot));
  if (args.gate === 'product-smoke') process.exit(verifyProductSmoke(args, outRoot));
  if (args.gate === 'runtime-plan' || args.gate === 'runtime') {
    process.exit(await verifyRuntime(args, outRoot));
  }
  if (args.gate === 'self-audit') process.exit(verifySelfAudit(outRoot, args.root));
  if (args.gate === 'baseline') process.exit(verifyBaseline(args, outRoot));
  console.error(`Unknown gate: ${args.gate}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(`sp-verify: ${e && e.stack ? e.stack : e}`);
  process.exit(1);
});
