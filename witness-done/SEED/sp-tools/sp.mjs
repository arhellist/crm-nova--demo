#!/usr/bin/env node
/**
 * sp — единый вход Witness Done
 *
 * Подкоманды: status | intake | next | decide | close | journal | review | progress | feedback |
 *              rules | doctor | verify | retrieve
 * Канон: catalogs/intake-and-decisions.md, catalogs/agent-rules.md, TEMPLATES/entry-protocol.md
 *
 * Коды возврата: 0 — ok, 2 — провал проверки, 3 — нужен человек (неоднозначность).
 * Зависимостей нет: только встроенные модули Node ≥18.
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  BOOKKEEPING_PREFIXES,
  REVIEW_VERDICTS,
  codeHash,
  coverageConfidence,
  expandProduces,
  readReview,
  recomputeEvidenceHash,
  reviewCheck,
  reviewPath,
  verifyEvidenceFile,
} from './evidence-lib.mjs';
import { parseProgress } from './progress-lib.mjs';
import { catalogIssues, loadInvariants } from './invariants-lib.mjs';
import { PLAN_REL, checkPlan, loadPlan } from './runtime-plan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUBCMDS = [
  'status',
  'intake',
  'next',
  'decide',
  'close',
  'journal',
  'review',
  'progress',
  'feedback',
  'rules',
  'doctor',
  'update',
  'verify',
  'retrieve',
];
const KINDS = ['new', 'question', 'change', 'task', 'bugfix'];

/**
 * Тексты из `TEMPLATES/decision-record.md`: пока они на месте, решение не считается оформленным.
 * `Axx.k` в списке нет: это обычная ссылка на фразу приёмки, и решение вроде DEC-020
 * («смоук обязан метить проверки номерами `Axx.k`») ловилось как незаполненное.
 */
const DECISION_PLACEHOLDERS = [
  'Что вынудило выбирать',
  'Что отвергли и почему',
  'Решение без подтверждения',
];

/** Следующий шаг по номеру текущего. Используется в `status` и `next`. */
const NEXT_STEP = {
  '00': 'PIPELINE/01_analyze_spec.md',
  '01': 'PIPELINE/02_constitution.md',
  '02': 'PIPELINE/03_architecture.md',
  '03': 'PIPELINE/04_data_and_api.md',
  '04': 'PIPELINE/05_security.md',
  '05': 'PIPELINE/06_nfr_scalability.md',
  '06': 'PIPELINE/07_component_library.md',
  '07': 'PIPELINE/08_tooling_lint_cicd.md',
  '08': 'PIPELINE/09_roadmap_and_dev_prompts.md',
  '09': 'PIPELINE/10_assembly.md',
  '10': 'PIPELINE/10b_self_audit.md',
  '10b': 'PIPELINE/R01_baseline_specs.md',
  R00: 'PIPELINE/R01_baseline_specs.md',
  R01: 'PIPELINE/R02_propose_change.md',
  R02: 'PIPELINE/R03_apply_change.md',
  R03: 'PIPELINE/R04_verify_change.md',
  R04: 'PIPELINE/R05_archive_change.md',
  R05: 'новый intake kind=change (spec-state/changes/<id>)',
};

const INSTALL_ROUTE = 'установить фабрику в <project>/witness-done/ → PIPELINE/00_bootstrap.md';

/** Транслитерация для имени файла записи входа: кириллица → латиница. */
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

/** Резервная копия TEMPLATES/intake.md — если фабрика не найдена рядом с CLI. */
const FALLBACK_INTAKE = `# INTAKE {{ID}}

| Поле | Значение |
|------|----------|
| kind | {{KIND}} |
| источник | {{SOURCE}} |
| создан | {{CREATED}} |
| статус | open |
| связано | {{LINKED}} |

## Запрос (дословно)

> {{REQUEST}}

## Снимок состояния

{{SNAPSHOT}}

## Классификация

{{REASON}}

## Маршрут

next: {{NEXT}}

## Заметки

—
`;

/** Резервная копия TEMPLATES/decision-log.md (без примеров записей). */
const FALLBACK_DECISIONS = `# Журнал решений проекта {{PROJECT_NAME}}

> Append-only: принятое не редактируется, \`DEC-###\` не переиспользуются.
> Одна запись — один файл в \`decisions/\`; этот файл собирается командой \`sp journal --index\`.
> Канон: catalogs/intake-and-decisions.md.

## Оглавление

| ID | Решение | Дата | Статус | Intake |
|----|---------|------|--------|--------|
{{INDEX}}
`;

const FALLBACK_DECISION_RECORD = `# {{ID}} — {{TITLE}}

| Поле | Значение |
|------|----------|
| Дата | {{DATE}} |
| Intake | {{INTAKE}} |
| Статус | принято |
| ADR | {{ADR}} |
| Заменяет | — |

**Контекст.** (заполнить: что вынудило выбирать)

**Решение.** {{DECISION}}

**Альтернативы.** (заполнить: что отвергли и почему)

**Чем подтверждено.** (Axx.k / тест / артефакт; без этого intake не закрывается)
`;

const FALLBACK_FEEDBACK_LITE = `# Feedback (lite) — {{PROJECT_NAME}}

> Режим lite: три вопроса вместо шести секций. Сгенерировано Witness Done v{{VERSION}}.

## 1. Можно начинать следующий D?

да | нет | да, с оговорками — и почему одной строкой.

## 2. Какие вопросы критичны?

- …

## 3. Что отложено?

- …

D закрыто: {{PROGRESS_DONE}} из {{PROGRESS_TOTAL}}.
`;

function parseArgs(argv) {
  const out = {
    cmd: null,
    text: [],
    rest: [],
    kind: null,
    source: 'chat',
    intake: null,
    adr: null,
    ref: null,
    targets: null,
    root: process.cwd(),
    factory: null,
    json: false,
    strict: false,
    staged: false,
    list: false,
    sync: false,
    check: false,
    init: false,
    index: false,
    migrate: false,
    limit: 10,
    verdict: null,
    notes: null,
    reviewer: null,
    team: false,
    merge: false,
    lite: false,
    offline: false,
    noCache: false,
    timeout: 8000,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--json') out.json = true;
    else if (a === '--strict') out.strict = true;
    else if (a === '--staged') out.staged = true;
    else if (a === '--list') out.list = true;
    else if (a === '--sync') out.sync = true;
    else if (a === '--check') out.check = true;
    else if (a === '--init') out.init = true;
    else if (a === '--index') out.index = true;
    else if (a === '--migrate') out.migrate = true;
    else if (a === '--limit') out.limit = Number(argv[++i]) || 10;
    else if (a === '--verdict') out.verdict = argv[++i];
    else if (a === '--notes') out.notes = argv[++i];
    else if (a === '--reviewer') out.reviewer = argv[++i];
    else if (a === '--team') out.team = true;
    else if (a === '--merge') out.merge = true;
    else if (a === '--lite') out.lite = true;
    else if (a === '--offline') out.offline = true;
    else if (a === '--no-cache') out.noCache = true;
    else if (a === '--timeout') out.timeout = Number(argv[++i]) || 8000;
    else if (a === '--kind') out.kind = argv[++i];
    else if (a === '--source') out.source = argv[++i];
    else if (a === '--intake') out.intake = argv[++i];
    else if (a === '--adr') out.adr = argv[++i];
    else if (a === '--ref') out.ref = argv[++i];
    else if (a === '--targets') out.targets = argv[++i];
    else if (a === '--root') out.root = path.resolve(argv[++i]);
    else if (a === '--factory') out.factory = path.resolve(argv[++i]);
    else if (out.cmd === 'verify' || out.cmd === 'retrieve') out.rest.push(a);
    else if (!out.cmd && SUBCMDS.includes(a)) out.cmd = a;
    else out.text.push(a);
  }
  if (!out.factory) {
    const cand = path.join(out.root, 'witness-done');
    out.factory = fs.existsSync(cand) ? cand : path.resolve(__dirname, '../..');
  }
  return out;
}

function help() {
  console.log(`Usage:
  sp.mjs status [--json]
  sp.mjs intake "<запрос дословно>" [--kind new|question|change|task|bugfix] [--source chat|issue|doc]
  sp.mjs next
  sp.mjs decide "<решение>" [--intake <id>] [--adr ADR-000N]
  sp.mjs close <intake-id> --ref <change-id|Dxx|DEC-###>
  sp.mjs journal [--init] [--index] [--check [--strict]] [--list] [--limit N] [--migrate]
  sp.mjs review <Dxx> --verdict supports|does_not_support|unclear [--notes "…"] [--reviewer "…"]
  sp.mjs progress [--merge] [--check]
  sp.mjs feedback [--lite]
  sp.mjs rules --list | --sync [--targets id,id] | --check
  sp.mjs doctor [--strict] [--staged] [--team] [--json]
  sp.mjs update [--json] [--offline] [--no-cache] [--timeout мс]
  sp.mjs verify <аргументы sp-verify>
  sp.mjs retrieve <аргументы sp-retrieve>

  Общие флаги (для любой подкоманды):
  --root <путь>      корень проекта (по умолчанию — текущий каталог)
  --factory <путь>   папка фабрики (по умолчанию <root>/witness-done, иначе рядом с CLI)
  --help             эта справка (код 0); без аргументов — она же с кодом 1

  status   — где стоит проект: MODE, шаг, активные changes, открытые записи входа, done без акта.
  intake   — запись входа journal/intake/<ID>.md с классификацией и маршрутом next:.
  next     — маршрут из последней открытой записи входа, иначе из MANIFEST.
  decide   — добавить DEC-### файлом в journal/decisions/ и пересобрать индекс.
  close    — закрыть запись входа ссылкой на артефакт.
  journal  — журнал проекта (journal/): init, index, check, list, migrate.
  review   — review-артефакт evidence/Dxx.review.json: кто-то действительно читал акт.
  progress — фрагменты roadmaps/progress.d/ собрать в progress.md (--merge) или сверить (--check).
  feedback — короткая обратная связь по готовности (--lite: три вопроса вместо шести секций).
  rules    — адаптеры правил IDE из AGENTS.md (SEED/agent-config/manifest.json).
  doctor   — проверки входа, правил, актов, journal, review и единственности ORCHESTRATOR.md.
             --strict: предупреждения считаются провалом; --staged: только staged-файлы;
             --team: командный режим — evidence_ref у done, дубли фрагментов progress.d,
             устаревший review.
  update   — сравнить VERSION фабрики с версией в репозитории (SEED/update.json).

  Коды: 0 ok, 2 провал проверки (для update — есть новая версия), 3 нужен человек /
  проверить не удалось (нет сети, пустой репозиторий, нет конфига).
`);
}

// ---------------------------------------------------------------- пути и чтение

/**
 * Журнал сопровождения канона. В репозитории фабрики OUTPUT/ обязан быть пустым
 * (validate.sh), поэтому записи входа и решения мейнтейнера идут в .witness-done-work/
 * (в .gitignore, в поставку не попадают).
 */
function canonJournalDir(factory) {
  return path.join(factory, '.witness-done-work');
}

function outputDir(root, factory) {
  const isCanon =
    path.resolve(root) === path.resolve(factory) &&
    fs.existsSync(path.join(factory, 'PIPELINE', '00_bootstrap.md')) &&
    fs.existsSync(path.join(factory, 'catalogs')) &&
    !fs.existsSync(path.join(factory, 'OUTPUT', 'MANIFEST.md'));
  if (isCanon) return canonJournalDir(factory);
  const b = path.join(root, 'witness-done', 'OUTPUT');
  const a = path.join(factory, 'OUTPUT');
  if (fs.existsSync(b)) return b;
  if (fs.existsSync(a)) return a;
  return a;
}

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Поля markdown-таблицы: `| Поле | Значение |` → { Поле: 'Значение' }. */
function tableFields(text) {
  const map = {};
  if (!text) return map;
  for (const line of text.split('\n')) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|\s*$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].replace(/\\\|/g, '|').trim();
    if (!(key in map)) map[key] = val;
  }
  return map;
}

function isEmptyStep(value) {
  return !value || value === '—' || value === '-' || value === '–' || /^pending$/i.test(value);
}

function manifestPath(outRoot) {
  return path.join(outRoot, 'MANIFEST.md');
}

function loadManifest(outRoot) {
  const file = manifestPath(outRoot);
  if (!fs.existsSync(file)) return null;
  return { file, fields: tableFields(read(file)) };
}

function projectMode(manifest) {
  const raw = (manifest?.fields?.MODE || '').toLowerCase();
  if (!raw || raw.includes('|')) return 'unknown';
  if (raw.includes('brownfield')) return 'brownfield';
  if (raw.includes('greenfield')) return 'greenfield';
  return 'unknown';
}

/** Значение поля паспорта: шаблонный плейсхолдер `a | b` считается незаполненным. */
function manifestValue(manifest, key) {
  const v = manifest?.fields?.[key];
  if (!v || v.includes('|')) return null;
  return v;
}

function projectLastStep(manifest) {
  const v = manifest?.fields?.last_completed_step;
  return isEmptyStep(v) ? null : String(v).trim();
}

function findSpecStateDir(root, factory) {
  const cands = [
    path.join(root, 'spec-state'),
    path.join(factory, 'spec-state'),
    path.join(root, 'witness-done', 'spec-state'),
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  return path.join(root, 'spec-state');
}

function activeChanges(args) {
  const target = path.join(findSpecStateDir(args.root, args.factory), 'changes');
  if (!fs.existsSync(target)) return [];
  return fs
    .readdirSync(target, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * Корень журнала. Журнал проекта — `<project>/journal`, он коммитится: это источник правды о
 * решениях. Журнал самого канона — `.witness-done-work/` в корне фабрики: локальный, вне git,
 * потому что канон — поставляемое дерево, и чужие записи в нём недопустимы.
 */
function journalDir(outRoot) {
  if (path.basename(outRoot) === '.witness-done-work') return outRoot;
  const factory = path.dirname(outRoot);
  return path.join(path.dirname(factory), 'journal');
}

function journalIntakeDir(outRoot) {
  return path.join(journalDir(outRoot), 'intake');
}

function journalDecisionsDir(outRoot) {
  return path.join(journalDir(outRoot), 'decisions');
}

function journalIndexPath(outRoot) {
  return path.join(journalDir(outRoot), 'decisions.md');
}

function scafoldDir(factory) {
  return path.join(factory, 'SEED', 'journal');
}

function ensureJournal(outRoot, factory) {
  const dir = journalDir(outRoot);
  if (!fs.existsSync(dir)) {
    const src = scafoldDir(factory);
    if (fs.existsSync(src)) fs.cpSync(src, dir, { recursive: true });
    else {
      mkdirp(journalIntakeDir(outRoot));
      mkdirp(journalDecisionsDir(outRoot));
    }
  }
  mkdirp(journalIntakeDir(outRoot));
  mkdirp(journalDecisionsDir(outRoot));
  rebuildIndex(outRoot, factory);
  return dir;
}

/** Журнал проекта + старые пути прогона: записи, сделанные до перехода на `journal/`. */
function intakeDirs(outRoot) {
  const dirs = [journalIntakeDir(outRoot)];
  const legacy = path.join(outRoot, 'intake');
  if (path.resolve(legacy) !== path.resolve(dirs[0])) dirs.push(legacy);
  return dirs;
}

function intakeFiles(outRoot) {
  const out = [];
  const seen = new Set();
  for (const dir of intakeDirs(outRoot)) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md') && !/-packet\.md$/i.test(x)).sort()) {
      if (seen.has(f)) continue;
      seen.add(f);
      out.push({ file: f, dir });
    }
  }
  return out;
}

function readIntakes(outRoot) {
  return intakeFiles(outRoot).map(({ file, dir }) => {
    const full = path.join(dir, file);
    const text = read(full) || '';
    const fields = tableFields(text);
    const id = file.replace(/\.md$/, '');
    return {
      id,
      file,
      full,
      dir,
      text,
      fields,
      kind: (fields.kind || '').trim(),
      status: (fields['статус'] || '').trim(),
      linked: (fields['связано'] || '').trim(),
      next: ((text.match(/^next:\s*(.+)$/m) || [])[1] || '').trim(),
    };
  });
}

function openIntakes(outRoot) {
  return readIntakes(outRoot).filter((i) => !/^closed$/i.test(i.status));
}

function decisionsPath(outRoot) {
  return journalIndexPath(outRoot);
}

function decisionFiles(outRoot) {
  const dir = journalDecisionsDir(outRoot);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^DEC-\d+.*\.md$/.test(f))
    .sort();
}

function decisionIdOf(file) {
  return (file.match(/^(DEC-\d+)/) || [])[1] || file.replace(/\.md$/, '');
}

/** Все записи журнала: файлы `decisions/`, индекс и старый монолит — только для чтения. */
function decisionsText(outRoot) {
  const parts = [];
  for (const f of decisionFiles(outRoot)) parts.push(read(path.join(journalDecisionsDir(outRoot), f)) || '');
  parts.push(stripHtmlComments(read(journalIndexPath(outRoot)) || ''));
  const legacy = path.join(outRoot, 'docs', 'decisions.md');
  if (path.resolve(legacy) !== path.resolve(journalIndexPath(outRoot))) {
    parts.push(stripHtmlComments(read(legacy) || ''));
  }
  return parts.join('\n');
}

function doneWithoutEvidence(outRoot) {
  const p = path.join(outRoot, 'roadmaps', 'progress.md');
  const text = read(p);
  if (!text) return [];
  const missing = [];
  for (const row of parseProgress(text).rows) {
    if (row.status !== 'done') continue;
    const ev = path.join(outRoot, 'evidence', `${row.id}.json`);
    if (!fs.existsSync(ev)) {
      missing.push(row.id);
      continue;
    }
    try {
      const j = JSON.parse(read(ev) || '{}');
      if (j.tax_pass !== true) missing.push(row.id);
    } catch {
      missing.push(row.id);
    }
  }
  return [...new Set(missing)];
}

/** Строки progress.md: id, ячейки и статус — общий источник для doctor/review. */
function progressRows(outRoot) {
  const text = read(path.join(outRoot, 'roadmaps', 'progress.md'));
  if (!text) return [];
  return parseProgress(text).rows;
}

/** D, отмеченные done в progress.md. */
function doneIds(outRoot) {
  return progressRows(outRoot)
    .filter((r) => r.status === 'done')
    .map((r) => r.id);
}

function progressSummary(outRoot) {
  const text = read(path.join(outRoot, 'roadmaps', 'progress.md'));
  if (!text) return null;
  const rows = parseProgress(text).rows;
  return { total: rows.length, done: rows.filter((r) => r.status === 'done').length };
}

// ---------------------------------------------------------------- текст и имена

function slugify(text) {
  const lat = String(text || '')
    .toLowerCase()
    .split('')
    .map((c) => (c in TRANSLIT ? TRANSLIT[c] : c))
    .join('');
  const slug = lat
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || 'intake';
}

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
}

function uniqueIntakeId(outRoot, base) {
  let id = base;
  let n = 2;
  while (intakeDirs(outRoot).some((dir) => fs.existsSync(path.join(dir, `${id}.md`)))) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

function loadFactoryTemplate(factory, rel, fallback) {
  const file = path.join(factory, rel);
  const text = read(file);
  return text === null ? fallback : text;
}

function renderTemplate(template, vars) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) => (key in vars ? vars[key] : m));
}

// ---------------------------------------------------------------- status

function nextStepFor(manifest) {
  const step = projectLastStep(manifest);
  if (!manifest || !step) return INSTALL_ROUTE;
  return NEXT_STEP[step] || `шаг ${step}: проверить MANIFEST (неизвестный last_completed_step)`;
}

function buildStatus(args, outRoot) {
  const manifest = loadManifest(outRoot);
  const intakes = readIntakes(outRoot);
  const decisions = decisionIndexRows(outRoot);
  const open = intakes.filter((i) => !/^closed$/i.test(i.status));
  const changes = activeChanges(args);
  const missingEvidence = doneWithoutEvidence(outRoot);
  const progress = progressSummary(outRoot);
  return {
    project_root: args.root,
    factory: args.factory,
    manifest: manifest ? manifest.file : null,
    mode: projectMode(manifest),
    run_mode: manifestMode(outRoot),
    profile: manifestValue(manifest, 'Профиль'),
    last_completed_step: projectLastStep(manifest),
    c_subwave: manifest?.fields?.c_subwave || null,
    journal: { dir: journalDir(outRoot), decisions: decisions.length, committed: !isCanonRepo(args) },
    intake_total: intakes.length,
    intake_open: open.map((i) => ({ id: i.id, kind: i.kind, next: i.next })),
    active_changes: changes,
    done_without_evidence: missingEvidence,
    progress,
    canon: isCanonRepo(args),
    next: isCanonRepo(args) ? CANON_ROUTE : nextStepFor(manifest),
  };
}

/** Маршрут в корне канона: прогона нет, работа идёт по регламенту мейнтейнера. */
const CANON_ROUTE =
  'правка канона: AGENTS/catalogs/PIPELINE/SEED/TEMPLATES → ./validate.sh → RESULT: PASS';

function cmdStatus(args, outRoot) {
  const s = buildStatus(args, outRoot);
  if (args.json) {
    console.log(JSON.stringify(s, null, 2));
    return 0;
  }
  const line = (k, v) => console.log(`${k}: ${v ?? '—'}`);
  console.log('Witness Done status');
  line('PROJECT_ROOT', s.project_root);
  line('FACTORY', s.factory);
  line('MODE', s.manifest ? s.mode : 'прогон не начат (MANIFEST нет)');
  if (s.run_mode === 'lite') line('Режим', 'LITE — coverage-matrix и exit-criteria не требуются');
  line('Профиль', s.profile);
  line('last_completed_step', s.last_completed_step);
  if (s.progress) line('прогресс D', `${s.progress.done}/${s.progress.total} done`);
  line(
    'Журнал',
    `${s.journal.dir} — решений ${s.journal.decisions}${s.journal.committed ? ' (коммитится)' : ' (локально, вне git)'}`,
  );
  line('Открытые intake', s.intake_open.length ? s.intake_open.map((i) => `${i.id} (${i.kind})`).join(', ') : 'нет');
  line('Активные changes', s.active_changes.length ? s.active_changes.join(', ') : 'нет');
  line('done без evidence', s.done_without_evidence.length ? s.done_without_evidence.join(', ') : 'нет');
  line('Версия фабрики', `${localVersion(args.factory) || '—'} (обновление: ${updateLine(args.factory)})`);
  line('Следующий шаг', s.next);
  if (!s.manifest) {
    console.log(
      s.canon
        ? 'Режим: корень канона. Прогона здесь нет, MANIFEST и не нужен — правка канона идёт через ./validate.sh.'
        : 'Внимание: MANIFEST отсутствует — прогон не начат. Маршрут установки см. README §4.',
    );
  }
  return 0;
}

// ---------------------------------------------------------------- intake

const CHANGE_VERBS = /добав|уб(ер|ра)|измен|сдела|реализ|исправ|обнов|переимен|удал|созда|внедр|настро|почин|дополн|перенес|замен|связ|расшир|подключ|\badd\b|\bremove\b|\bimplement\b|\brefactor\b|\bfix\b|\bchange\b|\bupdate\b/i;
/**
 * Границы слова для кириллицы: `\b` в JS работает по `\w` (только ASCII), поэтому
 * `^(как)\b` не совпадал ни с одним русским вопросом, а `обратн\w*` — ни с одним русским
 * заголовком (DEC-036). Явный класс символов — единственный способ.
 */
const WORD_END = '(?=$|[^\\wА-Яа-яЁё])';
const QUESTION_START = new RegExp(
  '^(можно|как|почему|зачем|что|где|когда|сколько|какой|какая|какие|каков|чей|стоит|нужен|нужна|нужно|надо|есть ли|поддерживается|должен|должна|должно|how|why|what|where|when|can|could|should|is|are|do|does)' +
    WORD_END,
  'i',
);
/**
 * Просьба об объяснении — это вопрос, а не изменение (DEC-037): «Объясни, как работает intake»
 * не должно открывать change-пакет. Повелительное наклонение само по себе недостаточно
 * («Объясни и исправь» — работа), поэтому требуется вопросительное слово рядом.
 */
const EXPLAIN_START = new RegExp(
  '^(объясни|объясните|расскажи|расскажите|опиши|опишите|поясни|поясните|растолкуй|растолкуйте|покажи|покажите|перечисли|перечислите)' +
    WORD_END,
  'i',
);
const INTERROGATIVE = new RegExp(
  '(?:^|[^\\wА-Яа-яЁё])(как|почему|зачем|что|где|когда|сколько|какой|какая|какие|каков|which|how|why|what|where|when)' +
    WORD_END,
  'i',
);
/**
 * Признаки дефекта (DEC-040): жалоба на уже принятое поведение, а не заказ новой работы.
 * Стем «ошибк» покрывает «ошибка/ошибки/ошибку», поэтому окончания не перечисляются.
 */
const DEFECT_MARKERS = new RegExp(
  '(?:ошибк|баг|дефект|падает|упал|сломал|перестал|регресс|не\\s+работа|некорректн|исключени)' +
    '|(?:^|[^A-Za-z])(bug|bugs|crash|broken|regression|exception|traceback|stacktrace|does\\s*n.?t\\s+work|does\\s+not\\s+work)' +
    '(?=$|[^A-Za-z])',
  'i',
);
/**
 * Заказ новой работы: при таком глаголе слово «ошибка» — это объект работы
 * («добавь обработку ошибок 500»), а не дефект. «Исправь/почини» сюда не входят — они
 * как раз означают устранение дефекта.
 */
const ADDITIVE_VERBS = new RegExp(
  '(?:добав|созда|реализ|внедр|подключ|расшир|дополн|настро|перенес|замен)' +
    '|(?:^|[^A-Za-z])(add|implement|introduce|create)(?=$|[^A-Za-z])',
  'i',
);

/**
 * Принятое поведение существует, только если что-то уже принято: brownfield (baseline)
 * или хотя бы одно задание `done`. Иначе «баг» — это ещё не написанный код, и вид входа
 * остаётся `task`/`change`.
 */
function hasAcceptedBehavior(ctx) {
  if (ctx.mode === 'brownfield') return true;
  return Boolean(ctx.progress && ctx.progress.done > 0);
}

/** Репозиторий канона: корень совпадает с фабрикой и прогон не начат. */
function isCanonRepo(args) {
  return (
    path.resolve(args.root) === path.resolve(args.factory) &&
    fs.existsSync(path.join(args.factory, 'PIPELINE', '00_bootstrap.md')) &&
    fs.existsSync(path.join(args.factory, 'catalogs')) &&
    !fs.existsSync(path.join(args.factory, 'OUTPUT', 'MANIFEST.md'))
  );
}

function classify(text, ctx) {
  const t = String(text || '').trim();
  const started = Boolean(ctx.manifest && ctx.lastStep);
  if (!started && !ctx.canon) {
    return { kind: 'new', reason: 'прогон не начат: MANIFEST отсутствует или last_completed_step пуст' };
  }
  const mentionsD = /\bD\d{2}\b/.test(t);
  if (mentionsD && ctx.mode === 'greenfield') {
    return { kind: 'task', reason: 'в запросе назван D-промпт, режим greenfield' };
  }
  // Вопрос проверяется до активного изменения: «почему медленно?» не создаёт change-пакет
  // (DEC-031). Активный change притягивает только запросы, которые меняют поведение.
  const isQuestion =
    /\?\s*$/.test(t) ||
    QUESTION_START.test(t) ||
    (EXPLAIN_START.test(t) && INTERROGATIVE.test(t));
  const hasVerb = CHANGE_VERBS.test(t);
  if (isQuestion && !hasVerb) {
    return { kind: 'question', reason: 'вопросительная форма без глагола изменения' };
  }
  if (isQuestion && hasVerb) {
    return {
      kind: null,
      reason: 'неоднозначно: форма вопроса, но есть глагол изменения',
      options: ['question', 'change'],
    };
  }
  /**
   * Дефект проверяется до активного изменения (DEC-040): жалоба на принятое поведение —
   * это `bugfix` даже когда открыт change-пакет, потому что причина идёт в `proposal.md` §1,
   * а не растворяется в чужой дельте. Заказ новой работы («добавь обработку ошибок»)
   * дефектом не считается: там «ошибка» — объект работы.
   */
  if (DEFECT_MARKERS.test(t) && !ADDITIVE_VERBS.test(t) && hasAcceptedBehavior(ctx)) {
    return {
      kind: 'bugfix',
      reason: 'признак дефекта при принятом поведении: причина — в proposal.md §1',
    };
  }
  if (ctx.changes.length) {
    return { kind: 'change', reason: `есть незакрытое изменение: ${ctx.changes.join(', ')}` };
  }
  if (ctx.mode === 'brownfield') {
    return { kind: 'change', reason: 'изменение в режиме brownfield' };
  }
  if (ctx.canon) {
    return { kind: 'change', reason: 'правка канона: корень совпадает с фабрикой, прогона нет' };
  }
  return { kind: 'task', reason: 'greenfield без явного изменения контракта: работа по заданию' };
}

function routeFor(kind, slug, canon) {
  if (canon) {
    switch (kind) {
      case 'question':
        return 'ответ по канону; решение зафиксировать: sp decide "<решение>" --intake <ID>';
      case 'new':
        return 'работа над каноном: правка AGENTS/catalogs/PIPELINE/SEED → ./validate.sh → RESULT: PASS';
      default:
        return 'работа над каноном: правка → ./validate.sh (RESULT: PASS) → справка в README/USAGE при необходимости';
    }
  }
  switch (kind) {
    case 'new':
      return 'PIPELINE/00_bootstrap.md → волны A–C по ORCHESTRATOR.md';
    case 'question':
      return 'ответить по артефактам; решение зафиксировать: sp decide "<решение>" --intake <ID>';
    case 'change':
      return `PIPELINE/R02_propose_change.md (id изменения: ${slug})`;
    case 'bugfix':
      return `PIPELINE/R02_propose_change.md (id: ${slug}); причина дефекта — в proposal.md §1`;
    case 'task':
      return 'OUTPUT/prompts/Dxx_*.md по catalogs/agent-harness.md (назови Dxx в запросе)';
    default:
      return INSTALL_ROUTE;
  }
}

function snapshotLines(ctx) {
  const lines = [];
  lines.push(`- MANIFEST: ${ctx.manifest ? 'есть' : 'нет'}`);
  if (ctx.manifest) {
    lines.push(`- last_completed_step: ${ctx.lastStep || '—'}`);
    lines.push(`- MODE: ${ctx.mode}`);
    const prof = manifestValue(ctx.manifest, 'Профиль');
    if (prof) lines.push(`- профиль: ${prof}`);
  }
  lines.push(`- активные changes: ${ctx.changes.length ? ctx.changes.join(', ') : 'нет'}`);
  lines.push(`- открытые intake: ${ctx.openIntakes}`);
  if (ctx.progress) lines.push(`- прогресс D: ${ctx.progress.done}/${ctx.progress.total} done`);
  return lines.join('\n');
}

function cmdIntake(args, outRoot, factory) {
  const request = args.text.join(' ').trim();
  if (!request) {
    console.error('Нужен текст запроса: sp intake "<запрос дословно>"');
    return 1;
  }
  const manifest = loadManifest(outRoot);
  const ctx = {
    manifest,
    lastStep: projectLastStep(manifest),
    mode: projectMode(manifest),
    canon: isCanonRepo(args),
    changes: activeChanges(args),
    openIntakes: openIntakes(outRoot).length,
    progress: progressSummary(outRoot),
  };

  let kind = args.kind;
  let reason = 'указан явно через --kind';
  if (!kind) {
    const guess = classify(request, ctx);
    if (!guess.kind) {
      const payload = { need_human: true, reason: guess.reason, options: guess.options, request };
      if (args.json) console.log(JSON.stringify(payload, null, 2));
      else {
        console.error(`Нужен человек: ${guess.reason}.`);
        console.error(`Варианты: ${guess.options.join(' | ')}`);
        console.error('Повтори с --kind <вариант>.');
      }
      return 3;
    }
    kind = guess.kind;
    reason = guess.reason;
  }
  if (!KINDS.includes(kind)) {
    console.error(`Неизвестный kind: ${kind}. Допустимо: ${KINDS.join(' | ')}`);
    return 1;
  }

  const slug = slugify(request);
  const id = uniqueIntakeId(outRoot, `${stamp()}-${slug}`);
  ensureJournal(outRoot, factory);
  const dir = journalIntakeDir(outRoot);
  mkdirp(dir);
  const tpl = loadFactoryTemplate(factory, 'TEMPLATES/intake.md', FALLBACK_INTAKE);
  const body = renderTemplate(tpl, {
    ID: id,
    KIND: kind,
    SOURCE: args.source,
    CREATED: new Date().toISOString(),
    LINKED: '—',
    REQUEST: request.replace(/\n/g, ' '),
    SNAPSHOT: snapshotLines(ctx),
    REASON: `${reason}.`,
    NEXT: routeFor(kind, slug, ctx.canon),
  });
  const file = path.join(dir, `${id}.md`);
  fs.writeFileSync(file, body, 'utf8');

  // task-задание: рядом с записью входа появляется минимальный пакет, а не полный промпт
  let packet = null;
  if (kind === 'task') {
    const tplPacket = loadFactoryTemplate(factory, 'TEMPLATES/spec-packet.md', null);
    if (tplPacket) {
      packet = path.join(dir, `${id}-packet.md`);
      fs.writeFileSync(packet, tplPacket, 'utf8');
    }
  }

  if (args.json) {
    const payload = { id, kind, file, next: routeFor(kind, slug, ctx.canon) };
    if (packet) payload.packet = packet;
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`Wrote ${file}`);
    if (packet) console.log(`Wrote ${packet} (заполнить: цель, non-goals, критерии, evidence)`);
    console.log(`kind: ${kind} (${reason})`);
    console.log(`next: ${routeFor(kind, slug, ctx.canon)}`);
  }
  return 0;
}

function cmdNext(args, outRoot) {
  const open = openIntakes(outRoot).filter((i) => i.next && i.next !== '—');
  if (open.length) {
    const last = open[open.length - 1];
    console.log(`intake: ${last.id}`);
    console.log(`next: ${last.next}`);
    return 0;
  }
  const manifest = loadManifest(outRoot);
  const step = nextStepFor(manifest);
  console.log(`next: ${step}`);
  return 0;
}

// ---------------------------------------------------------------- decide / close

function ensureDecisions(outRoot, factory) {
  ensureJournal(outRoot, factory);
  return journalIndexPath(outRoot);
}

function nextDecisionId(outRoot, text) {
  const ids = [...text.matchAll(/\bDEC-(\d{3,})\b/g)].map((m) => Number(m[1]));
  for (const f of decisionFiles(outRoot)) ids.push(Number((f.match(/\d+/) || [0])[0]));
  // Журнал коммитится, поэтому номер обязан быть свободен и в origin: иначе две ветки дадут DEC-005.
  try {
    const out = execFileSync('git', ['ls-tree', '-r', '--name-only', 'origin/main', '--', 'journal/decisions'], {
      cwd: journalDir(outRoot),
      encoding: 'utf8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const line of out.split('\n')) {
      const m = line.match(/DEC-(\d{3,})/);
      if (m) ids.push(Number(m[1]));
    }
  } catch (e) {
    /* нет git, нет origin/main, нет сети — номер считается по локальным файлам */
  }
  const next = ids.length ? Math.max(...ids) + 1 : 1;
  return `DEC-${String(next).padStart(3, '0')}`;
}

function decisionIndexRows(outRoot) {
  const dir = journalDecisionsDir(outRoot);
  const rows = [];
  for (const f of decisionFiles(outRoot)) {
    const text = read(path.join(dir, f)) || '';
    const id = decisionIdOf(f);
    const h1 = (text.match(/^#\s+(.+)$/m) || [])[1] || f.replace(/\.md$/, '');
    const title = h1.replace(new RegExp(`^${id}\\s*[—-]\\s*`), '').trim();
    const fields = tableFields(text);
    rows.push({
      id,
      title,
      date: (fields['Дата'] || fields['дата'] || '—').trim(),
      status: (fields['Статус'] || fields['статус'] || 'принято').trim(),
      intake: (fields['Intake'] || fields['intake'] || '—').trim(),
      file: f,
    });
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  return rows;
}

function rebuildIndex(outRoot, factory) {
  const tpl = loadFactoryTemplate(factory, 'TEMPLATES/decision-log.md', FALLBACK_DECISIONS);
  const manifest = loadManifest(outRoot);
  const name = manifestValue(manifest, 'Проект') || 'проект';
  const rows = decisionIndexRows(outRoot);
  const table = rows.length
    ? rows.map((r) => `| ${r.id} | ${r.title} | ${r.date} | ${r.status} | ${r.intake} |`).join('\n')
    : '| — | — | — | — | — |';
  const body = renderTemplate(tpl, { PROJECT_NAME: name, INDEX: table });
  mkdirp(journalDir(outRoot));
  fs.writeFileSync(journalIndexPath(outRoot), body, 'utf8');
  return rows;
}

/** Комментарии-примеры в шаблоне не должны считаться записями журнала. */
function stripHtmlComments(text) {
  return String(text || '').replace(/<!--[\s\S]*?-->/g, '');
}

function linkIntake(file, value) {
  const text = read(file);
  if (!text) return;
  const updated = /^\|\s*связано\s*\|/m.test(text)
    ? text.replace(/^\|\s*связано\s*\|.*$/m, `| связано | ${value} |`)
    : text;
  fs.writeFileSync(file, updated, 'utf8');
}

function cmdDecide(args, outRoot, factory) {
  const decision = args.text.join(' ').trim();
  if (!decision) {
    console.error('Нужен текст решения: sp decide "<решение>"');
    return 1;
  }
  const dir = ensureJournal(outRoot, factory);
  const date = new Date().toISOString().slice(0, 10);
  const id = nextDecisionId(outRoot, decisionsText(outRoot));
  const title = decision.length > 80 ? `${decision.slice(0, 77)}…` : decision;

  let intakeNote = '—';
  if (args.intake) {
    const hit = readIntakes(outRoot).find((i) => i.id === args.intake || i.id.startsWith(args.intake));
    if (!hit) {
      console.error(`intake не найден: ${args.intake}`);
      return 2;
    }
    intakeNote = hit.id;
  }

  const tpl = loadFactoryTemplate(factory, 'TEMPLATES/decision-record.md', FALLBACK_DECISION_RECORD);
  const body = renderTemplate(tpl, {
    ID: id,
    TITLE: title,
    DATE: date,
    INTAKE: intakeNote,
    ADR: args.adr || '—',
    DECISION: decision,
  });

  // Одна запись — один файл: параллельные ветки не конфликтуют в общем монолите.
  const base = `${id}-${slugify(title).slice(0, 40) || 'decision'}`;
  let file = path.join(journalDecisionsDir(outRoot), `${base}.md`);
  let n = 2;
  while (fs.existsSync(file)) {
    file = path.join(journalDecisionsDir(outRoot), `${base}-${n}.md`);
    n += 1;
  }
  fs.writeFileSync(file, body, { encoding: 'utf8', flag: 'wx' });

  if (args.intake) {
    const hit = readIntakes(outRoot).find((i) => i.id === args.intake || i.id.startsWith(args.intake));
    if (hit) linkIntake(hit.full, `${id} (${date})`);
  }
  rebuildIndex(outRoot, factory);

  if (args.json) console.log(JSON.stringify({ id, file, journal: dir }, null, 2));
  else {
    console.log(`Wrote ${path.relative(dir, file)} → ${id}`);
    console.log(`Журнал: ${dir} (коммитится: intake/, decisions/, decisions.md)`);
    console.log('Заполни «Контекст», «Альтернативы», «Чем подтверждено» — без них intake не закрыть.');
  }
  return 0;
}

function cmdClose(args, outRoot) {
  const idArg = args.text[0];
  if (!idArg) {
    console.error('Нужен id записи входа: sp close <intake-id> --ref <артефакт>');
    return 1;
  }
  if (!args.ref) {
    console.error('Нужен --ref: change-id, Dxx или DEC-###');
    return 2;
  }
  const hit = readIntakes(outRoot).find((i) => i.id === idArg || i.id.startsWith(idArg));
  if (!hit) {
    console.error(`intake не найден: ${idArg}`);
    return 2;
  }
  const ref = args.ref.trim();
  if (/^DEC-\d+/i.test(ref)) {
    const dec = decisionsText(outRoot);
    const wanted = ref.toUpperCase();
    const rec = decisionFiles(outRoot).find((f) => decisionIdOf(f) === wanted);
    if (!rec) {
      console.error(
        dec.includes(wanted)
          ? `ref ${ref}: запись есть только в индексе/старом журнале — перенести: sp journal --migrate`
          : `ref ${ref} не найден в журнале: ${path.join(journalDir(outRoot), 'decisions')}`,
      );
      return 2;
    }
    const missing = unfilledBlocks(read(path.join(journalDecisionsDir(outRoot), rec)) || '');
    if (missing.length) {
      console.error(`ref ${ref}: в ${rec} не заполнено — ${missing.join(', ')}. Заполнить и повторить close.`);
      return 2;
    }
  } else if (/^D\d{2}$/i.test(ref)) {
    if (!fs.existsSync(path.join(outRoot, 'evidence', `${ref.toUpperCase()}.json`))) {
      console.error(`ref ${ref}: нет OUTPUT/evidence/${ref.toUpperCase()}.json`);
      return 2;
    }
  } else {
    const changeDir = path.join(findSpecStateDir(args.root, args.factory), 'changes', ref);
    if (!fs.existsSync(changeDir)) {
      console.error(`ref ${ref}: нет spec-state/changes/${ref}/`);
      return 2;
    }
  }

  const alreadyClosed = /^\|\s*статус\s*\|\s*closed/i.test(hit.text);
  const prevRef = (hit.text.match(/^\|\s*связано\s*\|\s*(.+?)\s*\|/m) || [])[1] || '';

  let text = hit.text;
  text = text.replace(/^\|\s*статус\s*\|.*$/m, '| статус | closed |');
  text = text.replace(/^\|\s*связано\s*\|.*$/m, `| связано | ${ref} |`);
  fs.writeFileSync(hit.full, text, 'utf8');
  // Повторное закрытие не ошибка, но и не «только что закрыли»: факт должен быть виден.
  if (alreadyClosed) {
    const was = prevRef && prevRef !== ref ? ` (было ${prevRef})` : ' (запись уже была закрыта)';
    console.log(`closed ${hit.id} → ${ref}${was}`);
  } else {
    console.log(`closed ${hit.id} → ${ref}`);
  }
  return 0;
}

// ---------------------------------------------------------------- journal

function journalTree(outRoot) {
  return {
    dir: journalDir(outRoot),
    intake: journalIntakeDir(outRoot),
    decisions: journalDecisionsDir(outRoot),
    index: journalIndexPath(outRoot),
  };
}

/** Проблемы журнала: дубли номеров, запись без файла, ссылки в пустоту, дрейф индекса. */
/** Незаполненные блоки записи: пустые или шаблонные. Пустой список — решение оформлено. */
function unfilledBlocks(body) {
  const out = [];
  for (const key of ['Контекст', 'Решение', 'Альтернативы', 'Чем подтверждено']) {
    const m = body.match(new RegExp(`\\*\\*${key}\\.\\*\\*([^\\n]*)`));
    const value = (m ? m[1] : '').trim();
    if (!value || DECISION_PLACEHOLDERS.some((ph) => value.includes(ph))) out.push(key);
  }
  return out;
}

function journalCheck(outRoot, factory) {
  const t = journalTree(outRoot);
  const problems = [];
  const warnings = [];
  const files = decisionFiles(outRoot);

  const byId = new Map();
  for (const f of files) {
    const id = decisionIdOf(f);
    if (!/^DEC-\d{3,}$/.test(id)) problems.push(`файл ${f}: имя не начинается с DEC-###`);
    if (byId.has(id)) problems.push(`номер ${id} занят дважды: ${byId.get(id)} и ${f}`);
    else byId.set(id, f);
    const body = read(path.join(t.decisions, f)) || '';
    const head = (body.match(/^#\s+(DEC-\d+)/m) || [])[1];
    if (!head) problems.push(`файл ${f}: нет заголовка «# DEC-### — …»`);
    else if (head !== id) problems.push(`файл ${f}: заголовок ${head} не совпадает с именем`);
    for (const key of unfilledBlocks(body)) warnings.push(`${f}: блок «${key}» не заполнен`);
  }

  const ids = new Set(byId.keys());
  for (const i of readIntakes(outRoot)) {
    const ref = (i.linked.match(/DEC-\d+/) || [])[0];
    if (ref && !ids.has(ref)) problems.push(`${i.id}: ссылка на ${ref}, файла нет`);
    if (!/^closed$/i.test(i.status) && (!i.next || i.next === '—')) problems.push(`${i.id}: открыт без next:`);
  }

  // spec-packet существует только вместе с записью входа: иначе задача без входа
  if (fs.existsSync(t.intake)) {
    for (const f of fs.readdirSync(t.intake).filter((x) => /-packet\.md$/i.test(x))) {
      const base = f.replace(/-packet\.md$/i, '');
      if (!fs.existsSync(path.join(t.intake, `${base}.md`))) {
        problems.push(`${f}: нет записи входа journal/intake/${base}.md`);
      }
    }
  }

  // Индекс — производный вид: расхождение лечится `sp journal --index`, а не правкой руками.
  const indexRows = (stripHtmlComments(read(t.index) || '').match(/^\|\s*DEC-\d+/gm) || []).length;
  if (indexRows !== files.length) {
    warnings.push(`индекс: ${indexRows} строк, записей ${files.length} — выполнить sp journal --index`);
  }
  if (fs.existsSync(t.dir)) {
    const st = spawnSync('git', ['status', '--porcelain', '--', 'journal'], { cwd: t.dir, encoding: 'utf8' });
    if (st.status === 0 && st.stdout.trim()) {
      warnings.push('журнал изменён и не закоммичен — решения не уедут в origin');
    }
  }
  return { problems, warnings, files: files.length, ids };
}

function migrateJournal(outRoot, factory, dryRun) {
  const t = journalTree(outRoot);
  const moved = [];
  const legacyIntake = path.join(outRoot, 'intake');
  if (fs.existsSync(legacyIntake)) {
    for (const f of fs.readdirSync(legacyIntake).filter((x) => x.endsWith('.md'))) {
      const to = path.join(t.intake, f);
      moved.push(`intake/${f}`);
      if (!dryRun) {
        mkdirp(t.intake);
        fs.renameSync(path.join(legacyIntake, f), to);
      }
    }
  }
  const legacyDec = path.join(outRoot, 'docs', 'decisions.md');
  const monolith = stripHtmlComments(read(legacyDec) || '');
  if (monolith) {
    const re = /^###\s+(DEC-\d{3,})\s*[—-]\s*(.+)$/gm;
    const heads = [...monolith.matchAll(re)];
    for (let i = 0; i < heads.length; i++) {
      const id = heads[i][1];
      const title = heads[i][2].trim();
      const start = heads[i].index + heads[i][0].length;
      const end = i + 1 < heads.length ? heads[i + 1].index : monolith.length;
      const body = monolith.slice(start, end).trim();
      const file = path.join(t.decisions, `${id}-${slugify(title).slice(0, 40) || 'decision'}.md`);
      moved.push(`decisions/${path.basename(file)}`);
      if (!dryRun && !fs.existsSync(file)) {
        mkdirp(t.decisions);
        fs.writeFileSync(file, `# ${id} — ${title}\n\n${body}\n`, 'utf8');
      }
    }
  }
  if (!dryRun) rebuildIndex(outRoot, factory);
  return moved;
}

function cmdJournal(args, outRoot, factory) {
  const t = journalTree(outRoot);

  if (args.migrate) {
    const moved = migrateJournal(outRoot, factory, false);
    console.log(`journal: перенесено ${moved.length} файлов → ${t.dir}`);
    for (const m of moved) console.log(`  ${m}`);
    if (!moved.length) console.log('  переносить нечего: legacy-журнала в OUTPUT/ нет');
    return 0;
  }
  if (args.init) {
    ensureJournal(outRoot, factory);
    console.log(`journal: ${t.dir}`);
    console.log('  intake/      — записи входа (коммитится)');
    console.log('  decisions/   — по файлу на DEC-### (коммитится)');
    console.log('  decisions.md — индекс, собирается sp journal --index');
    return 0;
  }
  if (args.index) {
    ensureJournal(outRoot, factory);
    const rows = rebuildIndex(outRoot, factory);
    console.log(`journal: индекс пересобран — ${rows.length} записей → ${t.index}`);
    return 0;
  }
  if (args.check) {
    const r = journalCheck(outRoot, factory);
    const show = (list, tag) => list.forEach((x) => console.log(`${tag} ${x}`));
    show(r.problems, 'FAIL');
    show(r.warnings, 'WARN');
    const failed = r.problems.length > 0 || (args.strict && r.warnings.length > 0);
    if (args.json) {
      console.log(JSON.stringify({ ok: !failed, strict: !!args.strict, ...r, ids: [...r.ids] }, null, 2));
    } else {
      console.log(failed ? `journal: ${r.problems.length} проблем(ы), ${r.warnings.length} предупреждений` : 'journal: ok');
    }
    return failed ? 2 : 0;
  }

  const open = openIntakes(outRoot);
  const rows = decisionIndexRows(outRoot);
  const shown = rows.slice(-args.limit);
  if (args.json) {
    console.log(JSON.stringify({ journal: t.dir, open: open.map((i) => ({ id: i.id, kind: i.kind })), decisions: shown }, null, 2));
    return 0;
  }
  console.log(`Журнал: ${t.dir}`);
  console.log(`Решений: ${rows.length}${rows.length > args.limit ? ` (последние ${args.limit})` : ''}`);
  for (const r of shown) console.log(`  ${r.id}  ${r.date}  ${r.status}  ${r.title}`);
  if (!rows.length) console.log('  пусто — первое решение появится после sp decide');
  console.log(`Открытых записей входа: ${open.length}`);
  for (const i of open) console.log(`  ${i.id}  [${i.kind || '—'}]`);
  return 0;
}

// ---------------------------------------------------------------- review

/** Кто пишет review: флаг, SP_AGENT или git user.email. */
function reviewerId(args, root) {
  if (args.reviewer && args.reviewer.trim()) return args.reviewer.trim();
  if (process.env.SP_AGENT && process.env.SP_AGENT.trim()) return process.env.SP_AGENT.trim();
  const r = spawnSync('git', ['config', 'user.email'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 && (r.stdout || '').trim() ? r.stdout.trim() : null;
}

function reviewState(outRoot, d) {
  const p = reviewPath(outRoot, d);
  if (!fs.existsSync(p)) return { exists: false, file: p };
  const review = readReview(outRoot, d);
  if (review && review.__broken) return { exists: true, file: p, broken: true };
  return { exists: true, file: p, review };
}

function cmdReview(args, outRoot) {
  const d = (args.text[0] || '').trim().toUpperCase();
  if (!d) {
    console.error('Нужен id задания: sp review D03 --verdict supports');
    return 1;
  }
  if (!args.verdict) {
    console.error(`Нужен --verdict: ${REVIEW_VERDICTS.join(' | ')}`);
    return 1;
  }
  if (!REVIEW_VERDICTS.includes(args.verdict)) {
    console.error(`Неизвестный verdict: ${args.verdict}. Допустимо: ${REVIEW_VERDICTS.join(' | ')}`);
    return 1;
  }
  const evPath = path.join(outRoot, 'evidence', `${d}.json`);
  if (!fs.existsSync(evPath)) {
    console.error(`Нет акта evidence/${d}.json — сначала прогони sp-verify --d ${d} --gate pre_ci`);
    return 2;
  }
  let evidence;
  try {
    evidence = JSON.parse(read(evPath) || '{}');
  } catch {
    console.error(`evidence/${d}.json не читается как JSON`);
    return 2;
  }
  if (evidence.evidence_hash) {
    if (recomputeEvidenceHash(evidence) !== evidence.evidence_hash) {
      console.error(`evidence/${d}.json изменён после приёмки (evidence_hash не сходится) — пересоздай акт`);
      return 2;
    }
  } else {
    console.error(`evidence/${d}.json без evidence_hash — пересоздай акт гейтом pre_ci`);
    return 2;
  }

  const reviewer = reviewerId(args, args.root);
  if (!reviewer) {
    console.error('Не известен ревьюер: укажи --reviewer "<кто>" или настрой git user.email');
    return 1;
  }
  const producer = evidence.producer || null;
  if (producer && producer === reviewer) {
    console.error(`Ревьюер совпадает с создателем акта (${producer}) — независимой проверки нет`);
    return 2;
  }

  const review = {
    d,
    verdict: args.verdict,
    reviewer,
    notes: args.notes || '',
    acceptance_ids: (evidence.fit && evidence.fit.acceptance_ids) || [],
    code_hash: evidence.code_hash || codeHash(args.root, (evidence.fit && evidence.fit.produces) || []),
    evidence_ref: `evidence/${d}.json`,
    evidence_hash: evidence.evidence_hash || null,
    timestamp: new Date().toISOString(),
  };
  mkdirp(path.dirname(reviewPath(outRoot, d)));
  fs.writeFileSync(reviewPath(outRoot, d), JSON.stringify(review, null, 2), 'utf8');
  console.log(`Wrote ${reviewPath(outRoot, d)}`);
  console.log(`review ${d}: ${review.verdict} от ${review.reviewer}`);
  if (review.verdict !== 'supports') console.log('Вердикт не supports — pre_ci не примет акт.');
  else console.log(`Дальше: node SEED/sp-tools/sp-verify.mjs --d ${d} --gate pre_ci`);
  return 0;
}

// ---------------------------------------------------------------- progress

function progressFragmentsDir(outRoot) {
  return path.join(outRoot, 'roadmaps', 'progress.d');
}

function readProgressFragments(outRoot) {
  const dir = progressFragmentsDir(outRoot);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^D\d+.*\.md$/i.test(f))
    .sort()
    .map((f) => {
      const text = read(path.join(dir, f)) || '';
      const row = text.split('\n').find((l) => /^\|\s*D\d+/.test(l)) || null;
      const d = (f.match(/^D\d+/) || [null])[0];
      const updated =
        (text.match(/^\|\s*(?:updated_at|Обновлено)\s*\|\s*([^|\n]+)\|/im) || [])[1] ||
        (text.match(/\b\d{4}-\d{2}-\d{2}(?:T[\d:.Z+-]+)?\b/) || [])[0] ||
        null;
      return { file: f, d, row, updated: updated ? updated.trim() : null };
    });
}

/** Сборка строк таблицы D: конфликт решается более новым updated_at, равенство — отказ. */
function mergeProgressRows(fragments) {
  const out = new Map();
  const conflicts = [];
  for (const f of fragments) {
    if (!f.row || !f.d) continue;
    const prev = out.get(f.d);
    if (!prev) {
      out.set(f.d, f);
      continue;
    }
    const cmp = String(f.updated || '').localeCompare(String(prev.updated || ''));
    if (!f.updated || !prev.updated || cmp === 0) {
      const why = !f.updated || !prev.updated ? 'без различимого updated_at' : 'с равным updated_at';
      conflicts.push(`${f.d}: ${prev.file} и ${f.file} ${why}`);
    } else if (cmp > 0) {
      out.set(f.d, f);
    }
  }
  const rows = [...out.values()].sort((a, b) => a.d.localeCompare(b.d)).map((f) => f.row.trim());
  return { rows, conflicts };
}

function progressTableRange(lines) {
  const head = lines.findIndex((l) => /^\|\s*D\s*\|/.test(l));
  if (head < 0) return null;
  let last = head;
  for (let i = head; i < lines.length; i++) {
    if (/^\|/.test(lines[i])) last = i;
    else if (i > head + 1) break;
  }
  return { head, last };
}

function cmdProgress(args, outRoot, factory) {
  const progressFile = path.join(outRoot, 'roadmaps', 'progress.md');
  const fragments = readProgressFragments(outRoot);
  const { rows, conflicts } = mergeProgressRows(fragments);

  if (args.check) {
    if (!fragments.length) {
      console.log(`progress: фрагментов нет (${progressFragmentsDir(outRoot)}) — сверять нечего`);
      return 0;
    }
    const current = (read(progressFile) || '')
      .split('\n')
      .filter((l) => /^\|\s*D\d+/.test(l))
      .map((l) => l.trim());
    const missing = rows.filter((r) => !current.includes(r));
    const extra = current.filter((r) => !rows.includes(r));
    if (conflicts.length) for (const c of conflicts) console.error(`FAIL ${c}`);
    if (missing.length) console.error(`FAIL в progress.md нет строк: ${missing.length}`);
    if (extra.length) console.error(`FAIL в progress.md есть строки без фрагмента: ${extra.length} (правка руками или удалённый фрагмент)`);
    const failed = conflicts.length > 0 || missing.length > 0 || extra.length > 0;
    console.log(failed ? 'progress: расхождение с фрагментами' : 'progress: ok');
    return failed ? 2 : 0;
  }

  if (!args.merge) {
    console.log(`Фрагменты: ${progressFragmentsDir(outRoot)} (${fragments.length})`);
    for (const f of fragments) console.log(`  ${f.file}${f.updated ? `  ${f.updated}` : '  (без updated_at)'}`);
    console.log(`Собрать: sp progress --merge; сверить: sp progress --check`);
    return 0;
  }

  if (!fragments.length) {
    console.error('Фрагментов нет: roadmaps/progress.d/Dxx.md');
    return 2;
  }
  if (conflicts.length) {
    for (const c of conflicts) console.error(`FAIL ${c}`);
    console.error('Один D объявлен дважды без updated_at — объедини фрагменты руками');
    return 2;
  }

  const original = read(progressFile);
  if (original === null) {
    console.error('Нет roadmaps/progress.md — создай на шаге 09');
    return 2;
  }
  const lines = original.split('\n');
  const range = progressTableRange(lines);
  if (!range) {
    console.error('В progress.md не найдена таблица D (| D | … )');
    return 2;
  }
  const header = lines.slice(range.head, range.head + 2);
  const rebuilt = [...lines.slice(0, range.head), ...header, ...rows, ...lines.slice(range.last + 1)];
  fs.writeFileSync(progressFile, rebuilt.join('\n'), 'utf8');
  console.log(`progress: собрано ${rows.length} строк из ${fragments.length} фрагментов → ${progressFile}`);
  return 0;
}

// ---------------------------------------------------------------- feedback

function manifestMode(outRoot) {
  const manifest = loadManifest(outRoot);
  const v = manifestValue(manifest, 'Режим прогона');
  if (v && /lite/i.test(v)) return 'lite';
  if (process.env.SP_LITE === '1') return 'lite';
  return 'full';
}

function cmdFeedback(args, outRoot, factory) {
  const mode = args.lite ? 'lite' : manifestMode(outRoot);
  const tplRel = mode === 'lite' ? 'TEMPLATES/feedback-lite.md' : 'TEMPLATES/feedback.md';
  const tpl = loadFactoryTemplate(factory, tplRel, mode === 'lite' ? FALLBACK_FEEDBACK_LITE : null);
  if (!tpl) {
    console.error(`Нет ${tplRel}`);
    return 2;
  }
  const version = (read(path.join(factory, 'VERSION')) || '').trim() || '—';
  const progress = progressSummary(outRoot);
  const confidence = coverageConfidence(args.root, outRoot, doneIds(outRoot));
  let body = renderTemplate(tpl, {
    VERSION: version,
    PROJECT_NAME: manifestValue(loadManifest(outRoot), 'Проект') || 'проект',
    PROGRESS_DONE: progress ? String(progress.done) : '0',
    PROGRESS_TOTAL: progress ? String(progress.total) : '0',
    COVERAGE_CONFIDENCE: confidence.value.toFixed(2),
    RESIDUAL_RISK: confidence.residual_risk,
  });
  // Число дублируется в feedback: статистическая оценка важнее категорического «готово».
  if (!/\{\{\s*COVERAGE_CONFIDENCE\s*\}\}/.test(tpl)) {
    body +=
      mode === 'lite'
        ? `\nУверенность (coverage_confidence): \`${confidence.value.toFixed(2)}\` — ${confidence.residual_risk}.\n`
        : `\n## Уверенность (coverage_confidence)\n\n\`${confidence.value.toFixed(2)}\` — ${confidence.residual_risk}.\n\n` +
          `0.5 × доля PRODUCES с актом (${confidence.components.produces_with_act.confirmed}/${confidence.components.produces_with_act.total}) + ` +
          `0.3 × доля Axx с тестами (${confidence.components.acceptance_with_tests.confirmed}/${confidence.components.acceptance_with_tests.total}) + ` +
          `0.2 × доля L3 с trace (${confidence.components.l3_with_trace.confirmed}/${confidence.components.l3_with_trace.total}).\n\n` +
          `Это оценка, а не замена \`tax_pass\`: число показывает, насколько доказательства покрывают заявленное.\n`;
  }
  const dir = path.join(outRoot, 'docs');
  mkdirp(dir);
  const file = path.join(dir, mode === 'lite' ? 'feedback-lite.md' : 'feedback.md');
  fs.writeFileSync(file, body, 'utf8');
  console.log(`Wrote ${file} (${mode})`);
  if (mode === 'lite') console.log('Три вопроса вместо шести секций: цель, критичные вопросы, что отложено.');
  return 0;
}

// ---------------------------------------------------------------- rules

const SEED_DIR = 'SEED/agent-config';

function loadAgentManifest(factory) {
  const file = path.join(factory, SEED_DIR, 'manifest.json');
  const text = read(file);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error(`Битый SEED/agent-config/manifest.json: ${err.message}`);
    return null;
  }
}

function yamlFrontmatter(obj) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(obj || {})) {
    if (typeof v === 'boolean' || typeof v === 'number') {
      lines.push(`${k}: ${v}`);
      continue;
    }
    const s = String(v);
    // Кавычки только если значение небезопасно для YAML (двоеточие, спецсимволы, пробелы по краям)
    const unsafe = /[:#{}\[\],&*?|<>!%@`"']/.test(s) || /^\s|\s$/.test(s);
    lines.push(unsafe ? `${k}: ${JSON.stringify(s)}` : `${k}: ${s}`);
  }
  lines.push('---');
  return lines.join('\n');
}

function protocolBlock(agentsBody, manifest) {
  if (!agentsBody) return null;
  const start = agentsBody.indexOf(manifest.protocol_start);
  if (start < 0) return null;
  const end = agentsBody.indexOf(manifest.protocol_end, start);
  if (end < 0) return null;
  return agentsBody.slice(start, end + manifest.protocol_end.length);
}

function renderTarget(target, ctx) {
  const marker = ctx.manifest.generated_marker;
  switch (target.mode) {
    case 'copy':
      return `${marker}\n\n${ctx.agentsBody}\n`;
    case 'wrapped':
      return `${yamlFrontmatter(target.frontmatter)}\n${marker}\n\n${ctx.agentsBody}\n`;
    case 'include': {
      const tpl = read(path.join(ctx.factory, SEED_DIR, target.template));
      if (tpl === null) throw new Error(`нет шаблона ${target.template}`);
      return renderTemplate(tpl, { ENTRY_PROTOCOL: ctx.protocol || ctx.agentsBody });
    }
    case 'static':
      return `${target.content}`;
    case 'source': {
      const src = read(path.join(ctx.factory, target.source));
      if (src === null) throw new Error(`нет источника ${target.source}`);
      return src;
    }
    case 'toml': {
      const tpl = read(path.join(ctx.factory, SEED_DIR, target.template));
      if (tpl === null) throw new Error(`нет шаблона ${target.template}`);
      const src = read(path.join(ctx.factory, target.source)) || '';
      return renderTemplate(tpl, { PROMPT: src.replace(/"""/g, '\\"\\"\\"').trim() });
    }
    default:
      throw new Error(`неизвестный mode: ${target.mode}`);
  }
}

function rulesContext(args, outRoot) {
  const manifest = loadAgentManifest(args.factory);
  if (!manifest) return { error: 'SEED/agent-config/manifest.json не найден — фабрика указана неверно?' };
  const agentsFile = path.join(args.root, manifest.source || 'AGENTS.md');
  const agentsBody = read(agentsFile);
  return {
    manifest,
    factory: args.factory,
    agentsFile,
    agentsBody,
    protocol: protocolBlock(agentsBody || '', manifest),
  };
}

function targetStatus(target, ctx) {
  if (!ctx.agentsBody) return 'no-source';
  const file = path.join(ctx.root, target.path);
  const actual = read(file);
  if (actual === null) return 'missing';
  let expected;
  try {
    expected = renderTarget(target, ctx);
  } catch {
    return 'template-missing';
  }
  const norm = (s) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');
  return norm(actual) === norm(expected) ? 'ok' : 'drift';
}

function cmdRules(args, outRoot) {
  const ctx = rulesContext(args, outRoot);
  if (ctx.error) {
    console.error(ctx.error);
    return 2;
  }
  ctx.root = args.root;
  const targets = ctx.manifest.targets || [];
  const selected = args.targets
    ? targets.filter((t) => args.targets.split(',').map((s) => s.trim()).includes(t.id))
    : targets;

  if (!ctx.agentsBody && !args.list) {
    console.error(`Нет ${ctx.manifest.source} в ${args.root} — сначала шаг 00/02 должен создать правила.`);
    return 2;
  }

  if (args.list) {
    console.log('id                required  mode     status         path');
    for (const t of selected) {
      const st = targetStatus(t, ctx);
      console.log(
        `${t.id.padEnd(17)} ${(t.required ? 'да' : 'нет').padEnd(9)} ${t.mode.padEnd(8)} ${st.padEnd(14)} ${t.path}`,
      );
    }
    for (const f of ctx.manifest.forbidden || []) {
      const exists = fs.existsSync(path.join(args.root, f.path));
      console.log(`запрещён: ${f.path} — ${exists ? 'СОЗДАН (удалить)' : 'нет'}`);
    }
    return 0;
  }

  if (args.sync) {
    let wrote = 0;
    const problems = [];
    for (const t of selected) {
      let content;
      try {
        content = renderTarget(t, ctx);
      } catch (err) {
        problems.push(`${t.id}: ${err.message}`);
        continue;
      }
      const file = path.join(args.root, t.path);
      mkdirp(path.dirname(file));
      fs.writeFileSync(file, content, 'utf8');
      wrote += 1;
      console.log(`Wrote ${t.path}`);
    }
    for (const f of ctx.manifest.forbidden || []) {
      const p = path.join(args.root, f.path);
      if (fs.existsSync(p)) {
        console.log(`Внимание: ${f.path} существует и затеняет правила (${f.reason}). Удалить вручную.`);
      }
    }
    if (problems.length) {
      for (const p of problems) console.error(`FAIL ${p}`);
      return 2;
    }
    console.log(`Готово: ${wrote} файл(ов) правил.`);
    return 0;
  }

  // по умолчанию — проверка
  const problems = [];
  const warnings = [];
  for (const t of selected) {
    const st = targetStatus(t, ctx);
    if (st === 'ok') continue;
    const line = `${t.id} (${t.path}): ${st}`;
    if (t.required) problems.push(line);
    else warnings.push(line);
  }
  for (const f of ctx.manifest.forbidden || []) {
    if (fs.existsSync(path.join(args.root, f.path))) {
      problems.push(`${f.path}: запрещён (${f.reason})`);
    }
  }
  if (args.json) {
    console.log(JSON.stringify({ problems, warnings }, null, 2));
  } else {
    for (const p of problems) console.error(`FAIL ${p}`);
    for (const w of warnings) console.log(`WARN ${w}`);
    if (!problems.length) console.log(`Правила синхронны (${selected.length} целей).`);
  }
  return problems.length ? 2 : 0;
}

// ---------------------------------------------------------------- doctor

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

function gitChanged(root, staged) {
  const cmd = staged
    ? spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf8' })
    : spawnSync('git', ['status', '--porcelain', '-uall'], { cwd: root, encoding: 'utf8' });
  if (cmd.status !== 0) return null;
  const out = (cmd.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (staged) return out;
  return out.map((l) => {
    const body = l.slice(2).trim();
    const arrow = body.split(' -> ');
    return (arrow.length > 1 ? arrow[1] : body).replace(/^"|"$/g, '');
  });
}

function producesPaths(outRoot, root) {
  const dir = path.join(outRoot, 'prompts');
  if (!fs.existsSync(dir)) return [];
  const paths = [];
  for (const f of fs.readdirSync(dir).filter((n) => /\.md$/.test(n))) {
    const text = read(path.join(dir, f)) || '';
    const block = (text.match(/##\s*PRODUCES([\s\S]*?)(?:\n## |$)/i) || [])[1] || '';
    for (const line of block.split('\n')) {
      const m = line.match(/[-*`]\s*`?([^\s`|]+)`?/);
      if (!m) continue;
      const p = m[1].replace(/^[`]+|[`]+$/g, '').replace(/\/$/, '');
      if (p && (p.includes('/') || p.includes('.')) && !p.startsWith('OUTPUT/')) paths.push(p);
    }
  }
  const raw = [...new Set(paths)];
  // Glob раскрывается так же, как в sp-verify: иначе `src/events/**` давал ложные
  // предупреждения «файл вне PRODUCES» на каждом изменённом файле модуля.
  const expanded = new Set(raw);
  for (const p of raw.filter((x) => /[*?]/.test(x))) {
    for (const f of expandProduces(root, [p])) expanded.add(f);
  }
  return [...expanded];
}

/**
 * Что не считается «файлом заодно»: всё служебное (OUTPUT, журнал, spec-state) плюс живые
 * правила и адаптеры, которые пишет `sp rules --sync`. Список один на фабрику — из evidence-lib.
 */
const ALLOWED_PREFIXES = BOOKKEEPING_PREFIXES;

/** Проверки для корня канона: прогона нет, INPUT/OUTPUT — не вход, а заготовки. */
function canonDoctor(args, outRoot) {
  const problems = [];
  const warnings = [];
  const notes = [];

  const rctx = rulesContext(args, outRoot);
  if (rctx.error) {
    problems.push(rctx.error);
  } else {
    rctx.root = args.root;
    const agentsBody = rctx.agentsBody;
    if (!agentsBody) problems.push(`нет ${rctx.manifest.source} в корне канона — правила агента не подхватятся`);
    else {
      if (!agentsBody.includes(rctx.manifest.protocol_start)) {
        problems.push(`в ${rctx.manifest.source} нет маркера ${rctx.manifest.protocol_start} — агент не увидит протокол входа`);
      }
      if (!agentsBody.includes(rctx.manifest.protocol_end)) {
        problems.push(`в ${rctx.manifest.source} нет закрывающего маркера ${rctx.manifest.protocol_end}`);
      }
    }
    for (const t of rctx.manifest.targets || []) {
      if (!t.required) continue;
      const st = targetStatus(t, rctx);
      if (st !== 'ok') problems.push(`адаптер ${t.id} (${t.path}): ${st} — выполнить sp rules --sync`);
    }
    for (const f of rctx.manifest.forbidden || []) {
      if (fs.existsSync(path.join(args.root, f.path))) problems.push(`запрещённый файл ${f.path}: ${f.reason}`);
    }
    notes.push(`адаптеров IDE: ${(rctx.manifest.targets || []).filter((t) => t.required).length} обязательных`);
  }

  // OUTPUT в каноне — только пустая заготовка: артефакты запуска сюда попадать не должны
  const outDir = path.join(args.factory, 'OUTPUT');
  if (fs.existsSync(outDir)) {
    const dirty = fs.readdirSync(outDir).filter((f) => f !== '.gitkeep');
    if (dirty.length) {
      problems.push(`OUTPUT/ в каноне должен быть пустым, найдено ${dirty.length}: ${dirty.slice(0, 5).join(', ')}`);
    }
  } else {
    problems.push('нет OUTPUT/ — структура канона неполная');
  }

  // Журнал сопровождения канона не должен попадать в git
  const work = path.join(args.factory, '.witness-done-work');
  if (fs.existsSync(work)) {
    const ignored = git(['check-ignore', path.relative(args.factory, work) || '.witness-done-work'], args.factory);
    if (ignored === null) warnings.push('.witness-done-work/ существует, но не в .gitignore — журнал канона уедет в репозиторий');
  }

  // Заготовка журнала проекта: поставляется пустой, иначе чужие решения уедут в каждый проект
  const scaffold = scafoldDir(args.factory);
  if (!fs.existsSync(scaffold)) {
    problems.push('нет SEED/journal/ — проект не получит заготовку журнала');
  } else {
    const records = fs.existsSync(path.join(scaffold, 'decisions'))
      ? fs.readdirSync(path.join(scaffold, 'decisions')).filter((f) => /\.md$/.test(f))
      : [];
    if (records.length) {
      problems.push(`SEED/journal/decisions/ должен быть пустым, найдено ${records.length}: ${records.slice(0, 3).join(', ')}`);
    }
    const idx = read(path.join(scaffold, 'decisions.md')) || '';
    if (/\bDEC-\d{3,}\b/.test(idx)) {
      problems.push('SEED/journal/decisions.md содержит заполненные DEC-### — в поставке журнал пустой');
    }
    for (const sub of ['intake', 'decisions']) {
      if (!fs.existsSync(path.join(scaffold, sub))) problems.push(`нет SEED/journal/${sub}/`);
    }
    notes.push('заготовка журнала: SEED/journal/ (пустая, коммитится в проекте как journal/)');
  }

  // VERSION — одна строка semver
  const version = (read(path.join(args.factory, 'VERSION')) || '').trim();
  if (!version) problems.push('нет VERSION в корне канона');
  else if (!/^\d+\.\d+\.\d+$/.test(version)) problems.push(`VERSION должен быть одной строкой X.Y.Z, получено «${version}»`);

  // Конфиг проверки обновлений
  const cfg = loadUpdateConfig(args.factory);
  if (!cfg) warnings.push(`нет или битый ${UPDATE_CONFIG} — sp update не сможет проверить версию`);

  // Единственность ORCHESTRATOR.md — то же правило, что для проекта
  const orch = walkFiles(args.root).filter((f) => path.basename(f) === 'ORCHESTRATOR.md');
  if (orch.length !== 1) {
    problems.push(
      orch.length === 0
        ? 'ORCHESTRATOR.md не найден — канон неполный'
        : `ORCHESTRATOR.md должен быть один, найдено ${orch.length}: ${orch.map((f) => path.relative(args.root, f)).join(', ')}`,
    );
  } else if (path.resolve(orch[0]) !== path.resolve(path.join(args.factory, 'ORCHESTRATOR.md'))) {
    problems.push(`ORCHESTRATOR.md лежит не в корне фабрики: ${path.relative(args.root, orch[0])}`);
  }

  notes.push('режим: корень канона (проверки прогона пропущены; канон дополнительно проверяет ./validate.sh)');
  const failed = problems.length + (args.strict ? warnings.length : 0);
  if (args.json) {
    console.log(JSON.stringify({ ok: failed === 0, canon: true, strict: args.strict, problems, warnings, notes }, null, 2));
  } else {
    for (const p of problems) console.error(`FAIL ${p}`);
    for (const w of warnings) console.log(`${args.strict ? 'FAIL' : 'WARN'} ${w}`);
    for (const n of notes) console.log(`INFO ${n}`);
    if (failed === 0) console.log(`doctor: ok${args.strict ? ' (strict)' : ''} — корень канона`);
    else console.error(`doctor: ${failed} проблем(а/ы)${args.strict ? ' в strict-режиме' : ''}`);
  }
  return failed === 0 ? 0 : 2;
}

function cmdDoctor(args, outRoot) {
  if (isCanonRepo(args)) return canonDoctor(args, outRoot);

  const problems = [];
  const warnings = [];
  const notes = [];
  const add = (ok, msg) => {
    if (!ok) problems.push(msg);
  };
  const warn = (ok, msg) => {
    if (!ok) warnings.push(msg);
  };

  // 1. Правила агента и адаптеры
  const rctx = rulesContext(args, outRoot);
  if (rctx.error) {
    problems.push(rctx.error);
  } else {
    rctx.root = args.root;
    const agentsBody = rctx.agentsBody;
    add(Boolean(agentsBody), `нет ${rctx.manifest.source} в корне проекта — правила агента не подхватятся`);
    if (agentsBody) {
      add(
        agentsBody.includes(rctx.manifest.protocol_start),
        `в ${rctx.manifest.source} нет маркера ${rctx.manifest.protocol_start} — агент не увидит протокол входа`,
      );
      add(
        agentsBody.includes(rctx.manifest.protocol_end),
        `в ${rctx.manifest.source} нет закрывающего маркера ${rctx.manifest.protocol_end}`,
      );
    }
    for (const t of rctx.manifest.targets || []) {
      if (!t.required) continue;
      const st = targetStatus(t, rctx);
      add(st === 'ok', `адаптер ${t.id} (${t.path}): ${st} — выполнить sp rules --sync`);
    }
    for (const f of rctx.manifest.forbidden || []) {
      add(!fs.existsSync(path.join(args.root, f.path)), `запрещённый файл ${f.path}: ${f.reason}`);
    }
  }

  // 2. Открытые записи входа
  const open = openIntakes(outRoot);
  for (const i of open) {
    add(Boolean(i.next) && i.next !== '—', `intake ${i.id}: пустой next — маршрут не определён`);
    if (i.kind && i.kind !== 'question') {
      const linked = (i.linked && i.linked !== '—' && i.linked.trim() !== '') || /DEC-\d{3,}/.test(i.text);
      warn(linked, `intake ${i.id} (${i.kind}) без связанного change/Dxx/DEC`);
    }
  }
  notes.push(`открытых intake: ${open.length}`);

  // 2b. Журнал: дубли DEC, битые ссылки, дрейф индекса, незакоммиченные решения
  const jr = journalCheck(outRoot, args.factory);
  for (const m of jr.problems) problems.push(`журнал: ${m}`);
  for (const m of jr.warnings) warnings.push(`журнал: ${m}`);
  notes.push(`решений в журнале: ${jr.files}`);

  // 3. done без акта
  const missing = doneWithoutEvidence(outRoot);
  add(missing.length === 0, `done без evidence: ${missing.join(', ')}`);
  // Строка, которую парсер не понял, — это пропущенная проверка. Пусть будет видно.
  const progressText = read(path.join(outRoot, 'roadmaps', 'progress.md'));
  if (progressText) {
    const pr = parseProgress(progressText);
    add(pr.issues.length === 0, `progress.md: ${pr.issues.join('; ')}`);
    const stepNow = parseInt((loadManifest(outRoot)?.fields?.last_completed_step || '').replace(/\D.*$/, ''), 10);
    if (pr.rows.length === 0 && Number.isFinite(stepNow) && stepNow >= 9) {
      add(false, 'progress.md: нет ни одной строки задания, хотя роадмап уже собран');
    }
  }

  // 3b. План рантайма: если принят код, подъём и проверка обязаны быть зафиксированы
  const evidenceDir = path.join(outRoot, 'evidence');
  let hasRuntimeCode = false;
  if (fs.existsSync(evidenceDir)) {
    for (const f of fs.readdirSync(evidenceDir)) {
      if (!/^D\d+\.json$/.test(f)) continue;
      try {
        const j = JSON.parse(fs.readFileSync(path.join(evidenceDir, f), 'utf8'));
        if (((j.fit && j.fit.produces) || []).length) hasRuntimeCode = true;
      } catch {
        /* битый акт ловит evidence-gate */
      }
    }
  }
  // До шага 08 плана ещё нет по определению: не наказываем прогон за будущий шаг.
  const stepNo = parseInt((loadManifest(outRoot)?.fields?.last_completed_step || '').replace(/\D.*$/, ''), 10);
  if (hasRuntimeCode && (!Number.isFinite(stepNo) || stepNo >= 8)) {
    const lp = loadPlan(outRoot);
    add(lp.required, `нет ${PLAN_REL} — как поднимать окружение и чем проверять фразы, не зафиксировано`);
    if (lp.required && !lp.read_error) {
      const cp = checkPlan(args.root, outRoot, lp.plan);
      for (const m of cp.issues) problems.push(`runtime-plan: ${m}`);
      notes.push(`runtime: проверок ${cp.coverage.covered.length}, N/A ${cp.coverage.na.length}`);
    }
  }

  // 4. Изменённые файлы вне PRODUCES
  const manifest = loadManifest(outRoot);
  const mode = projectMode(manifest);
  const changed = gitChanged(args.root, args.staged);
  if (changed === null) {
    notes.push('git недоступен — проверка изменённых файлов пропущена');
  } else if (!changed.length) {
    notes.push('изменённых файлов нет');
  } else {
    const produces = producesPaths(outRoot, args.root);
    if (!produces.length) {
      notes.push('PRODUCES не найдены (прогон не дошёл до 09) — проверка изменённых файлов пропущена');
    } else {
      const outside = changed.filter(
        (f) => !produces.some((p) => f === p || f.startsWith(`${p}/`)) && !ALLOWED_PREFIXES.some((p) => f.startsWith(p)),
      );
      warn(
        !outside.length,
        `изменены файлы вне PRODUCES и вне intake/evidence: ${outside.slice(0, 5).join(', ')}${outside.length > 5 ? ` (+${outside.length - 5})` : ''}`,
      );
    }
  }
  if (mode === 'unknown') notes.push('MODE не определён (MANIFEST отсутствует)');

  // 5. DEC-ссылки и связь change ↔ intake
  const decText = decisionsText(outRoot);
  const mentionDec = [];
  for (const i of readIntakes(outRoot)) {
    for (const m of i.text.matchAll(/\bDEC-\d{3,}\b/g)) mentionDec.push(m[0]);
  }
  const changesDir = path.join(findSpecStateDir(args.root, args.factory), 'changes');
  if (fs.existsSync(changesDir)) {
    for (const id of activeChanges(args)) {
      const proposal = read(path.join(changesDir, id, 'proposal.md'));
      if (proposal === null) {
        warnings.push(`change ${id}: нет proposal.md`);
        continue;
      }
      const hasIntake = /\|\s*Intake\s*\|/i.test(proposal) || /^intake:/im.test(proposal);
      warn(hasIntake, `change ${id}: в proposal.md нет поля Intake (трассировка к запросу потеряна)`);
      // Поле Intake должно вести к существующей записи, иначе трассировка формальная.
      const intakeRef = (
        (proposal.match(/\|\s*Intake\s*\|\s*([^|\n]+)\|/i) || [])[1] ||
        (proposal.match(/^intake:\s*(.+)$/im) || [])[1] ||
        ''
      )
        .replace(/`/g, '')
        .trim();
      if (intakeRef && !/^—$|^-$|^none$|^нет$/i.test(intakeRef)) {
        const known = readIntakes(outRoot).some(
          (i) => i.id === intakeRef || i.id.startsWith(intakeRef),
        );
        add(known, `change ${id}: Intake «${intakeRef}» не найден в journal/intake — трассировка битая`);
      }
      for (const m of proposal.matchAll(/\bDEC-\d{3,}\b/g)) mentionDec.push(m[0]);
    }
  }
  for (const dec of [...new Set(mentionDec)]) {
    add(decText.includes(dec), `упомянут ${dec}, но записи нет в журнале journal/decisions/`);
  }

  // 5b. Целостность актов и review: акт не подменён, для L2+ кто-то его читал
  const done = doneIds(outRoot);
  for (const d of done) {
    const evFile = path.join(outRoot, 'evidence', `${d}.json`);
    if (!fs.existsSync(evFile)) {
      add(false, `${d} в progress.md done, но evidence/${d}.json нет`);
      continue;
    }
    const sealed = verifyEvidenceFile(args.root, path.join(outRoot, 'evidence', `${d}.json`));
    for (const i of sealed.issues) add(false, `${d}: ${i}`);
    let ev = null;
    try {
      ev = JSON.parse(read(evFile) || '{}');
    } catch {
      add(false, `evidence/${d}.json не читается как JSON`);
    }
    const level = (ev && (ev.level || '')).toUpperCase();
    if (ev && (level === 'L2' || level === 'L3')) {
      const rc = reviewCheck(args.root, outRoot, d, ev);
      for (const i of rc.issues) add(false, `${d}: review — ${i}`);
    }
  }
  // 5b2. Командный режим: фрагменты прогресса, evidence_ref у done, review не пуст и не устарел
  if (args.team) {
    const rows = progressRows(outRoot);
    const done = rows.filter((r) => r.status === 'done');
    for (const r of done) {
      const ref = r.cells.find((c) => /^evidence\/|\bD\d+\.json\b/.test(c));
      if (!ref) add(false, `${r.id}: done без evidence_ref в progress.md`);
    }
    const fragments = readProgressFragments(outRoot);
    const seen = new Map();
    for (const f of fragments) {
      if (!f.d) continue;
      if (seen.has(f.d)) add(false, `${f.d} объявлен дважды: ${seen.get(f.d)} и ${f.file}`);
      else seen.set(f.d, f.file);
    }
    for (const r of done) {
      const state = reviewState(outRoot, r.id);
      if (!state.exists) continue;
      if (state.broken) {
        add(false, `${r.id}: review.json не читается как JSON`);
        continue;
      }
      const rv = state.review || {};
      if (!rv.reviewer || !String(rv.reviewer).trim()) add(false, `${r.id}: review без reviewer`);
      if (!rv.timestamp || Number.isNaN(Date.parse(rv.timestamp))) {
        add(false, `${r.id}: review без timestamp`);
      }
    }
  }

  // 5c. Каталог глобальных инвариантов: целостность и ссылки из done-заданий
  for (const i of catalogIssues(outRoot)) add(false, `project-invariants: ${i}`);
  const invLoaded = loadInvariants(outRoot);
  if (invLoaded.exists) {
    const known = new Set(invLoaded.items.map((i) => i.id));
    const promptsDir = path.join(outRoot, 'prompts');
    const promptFiles = fs.existsSync(promptsDir) ? fs.readdirSync(promptsDir) : [];
    for (const d of done) {
      const f = promptFiles.find((x) => new RegExp(`^${d}[_-].*\\.md$`, 'i').test(x));
      if (!f) continue;
      const text = read(path.join(promptsDir, f)) || '';
      const refs = [...new Set((text.match(/INV-\d+/g) || []).map((x) => x.toUpperCase()))];
      for (const ref of refs) {
        if (!known.has(ref)) add(false, `${d}: ссылка на ${ref}, которого нет в project-invariants.md`);
      }
    }
  }

  // review старше кода: файл есть, D не done — предупреждение, а не провал
  const evDir = path.join(outRoot, 'evidence');
  if (fs.existsSync(evDir)) {
    const reviews = fs.readdirSync(evDir).filter((f) => /^D\d+\.review\.json$/i.test(f));
    for (const f of reviews) {
      const d = f.replace(/\.review\.json$/i, '');
      const evFile = path.join(evDir, `${d}.json`);
      if (!fs.existsSync(evFile)) {
        warn(false, `evidence/${f} без акта evidence/${d}.json`);
        continue;
      }
      try {
        const ev = JSON.parse(read(evFile) || '{}');
        const rv = JSON.parse(read(path.join(evDir, f)) || '{}');
        if (ev.code_hash && rv.code_hash && ev.code_hash.produces_digest !== rv.code_hash.produces_digest) {
          warn(false, `evidence/${f} устарел: код изменился после review`);
        }
      } catch {
        warn(false, `evidence/${f} не читается как JSON`);
      }
    }
  }

  // 6. Чистота входа
  const answers = read(path.join(args.factory, 'INPUT', 'ANSWERS.md')) || '';
  const filledAnswers = (answers.match(/^A:[ \t]*\S/gm) || []).length;
  const started = Boolean(manifest && projectLastStep(manifest));
  warn(
    !(!started && filledAnswers > 0),
    `INPUT/ANSWERS.md содержит ${filledAnswers} ответ(ов), а прогон не начат — это ответы другого прогона, очистить`,
  );
  const leftovers = ['docs', 'prompts', 'evidence', 'roadmaps', 'tooling'].flatMap((sub) =>
    fs.existsSync(path.join(outRoot, sub))
      ? fs.readdirSync(path.join(outRoot, sub)).filter((f) => f !== '.gitkeep')
      : [],
  );
  warn(!(!started && leftovers.length > 0), `в OUTPUT есть артефакты (${leftovers.length}) при незапущенном прогоне`);
  const techSpec = read(path.join(args.factory, 'INPUT', 'TECH_SPEC.md')) || '';
  if (!started) {
    warn(!/\(заполни\)/.test(techSpec), 'INPUT/TECH_SPEC.md не заполнен — прогон не сможет начаться');
  }

  // 7. Единственность ORCHESTRATOR.md
  const orch = walkFiles(args.root).filter((f) => path.basename(f) === 'ORCHESTRATOR.md');
  add(
    orch.length === 1,
    orch.length === 0
      ? 'ORCHESTRATOR.md не найден — фабрика не установлена?'
      : `ORCHESTRATOR.md должен быть один, найдено ${orch.length}: ${orch.map((f) => path.relative(args.root, f)).join(', ')}`,
  );
  if (orch.length === 1) {
    const rootOrch = path.join(args.factory, 'ORCHESTRATOR.md');
    add(
      path.resolve(orch[0]) === path.resolve(rootOrch),
      `ORCHESTRATOR.md лежит не в корне фабрики: ${path.relative(args.root, orch[0])}`,
    );
  }

  const strict = args.strict;
  const failed = problems.length + (strict ? warnings.length : 0);
  if (args.json) {
    console.log(JSON.stringify({ ok: failed === 0, strict, problems, warnings, notes }, null, 2));
  } else {
    for (const p of problems) console.error(`FAIL ${p}`);
    for (const w of warnings) console.log(`${strict ? 'FAIL' : 'WARN'} ${w}`);
    for (const n of notes) console.log(`INFO ${n}`);
    if (failed === 0) console.log(`doctor: ok${strict ? ' (strict)' : ''}`);
    else console.error(`doctor: ${failed} проблем(а/ы)${strict ? ' в strict-режиме' : ''}`);
  }
  return failed === 0 ? 0 : 2;
}

// ---------------------------------------------------------------- update

const UPDATE_CONFIG = 'SEED/update.json';
const CACHE_DIR = '.sp-cache';

function loadUpdateConfig(factory) {
  const text = read(path.join(factory, UPDATE_CONFIG));
  if (text === null) return null;
  try {
    const cfg = JSON.parse(text);
    if (!cfg.repo || !/^[\w.-]+\/[\w.-]+$/.test(cfg.repo)) return null;
    return { branch: 'main', version_path: 'VERSION', ...cfg };
  } catch {
    return null;
  }
}

function localVersion(factory) {
  const v = read(path.join(factory, 'VERSION'));
  return v === null ? null : v.trim();
}

/** Сравнение версий: -1 если a < b, 0 если равны, 1 если a > b. Пре-релизы игнорируются. */
function semverCmp(a, b) {
  const norm = (v) =>
    String(v || '')
      .trim()
      .replace(/^v/i, '')
      .split(/[-+]/)[0]
      .split('.')
      .map((x) => parseInt(x, 10) || 0);
  const pa = norm(a);
  const pb = norm(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** HTTPS GET с таймаутом. Возвращает { status, body } или { error }. */
function fetchText(url, timeoutMs) {
  return new Promise((resolve) => {
    let req;
    try {
      req = https.get(url, { headers: { 'user-agent': 'witness-done-sp-update' } }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }),
        );
      });
    } catch (err) {
      resolve({ error: err.message });
      return;
    }
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ error: `таймаут ${timeoutMs} мс` });
    });
    req.on('error', (err) => resolve({ error: err.message }));
  });
}

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 10000 });
  if (r.status !== 0) return null;
  return (r.stdout || '').trim();
}

/** owner/repo из GitHub-URL, иначе null (локальный mirror, file://). */
function githubRepoFromUrl(url) {
  const m = String(url || '').match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** origin фабрики в виде owner/repo, если это GitHub-клон. */
function gitOriginRepo(factory) {
  return githubRepoFromUrl(git(['remote', 'get-url', 'origin'], factory));
}

function isGitClone(factory) {
  return Boolean(git(['remote', 'get-url', 'origin'], factory));
}

/** Версия из тегов remote (без скачивания файлов). */
function remoteVersionFromGit(factory, cfg) {
  const url = git(['remote', 'get-url', 'origin'], factory);
  if (!url) return null;
  const repo = githubRepoFromUrl(url);
  if (repo && repo.toLowerCase() !== cfg.repo.toLowerCase()) {
    return { error: `origin указывает на ${repo}, а конфиг ждёт ${cfg.repo}` };
  }
  const out = git(['ls-remote', '--tags', '--heads', 'origin'], factory);
  if (out === null) return { error: 'git ls-remote не удался (нет сети?)' };
  const versions = [];
  for (const line of out.split('\n')) {
    const ref = (line.split('\t')[1] || '').trim();
    const tag = ref.match(/^refs\/tags\/v?(\d+\.\d+\.\d+)/);
    if (tag) versions.push(tag[1]);
  }
  if (!versions.length) return { error: 'в репозитории нет тегов версий (vX.Y.Z)' };
  versions.sort(semverCmp);
  return {
    version: versions[versions.length - 1].replace(/^v/, ''),
    source: repo ? 'git-теги' : 'git-теги (mirror)',
    repo: repo || cfg.repo,
  };
}

/** Версия из VERSION по HTTPS — работает и для установки копированием. */
async function remoteVersionFromHttp(cfg, timeoutMs) {
  const url = `https://raw.githubusercontent.com/${cfg.repo}/${cfg.branch}/${cfg.version_path}`;
  const r = await fetchText(url, timeoutMs);
  if (r.error) return { error: `нет связи с ${cfg.repo}: ${r.error}` };
  if (r.status === 404) {
    return {
      error: `VERSION не найден в ${cfg.repo}@${cfg.branch} (репозиторий пуст или ветка другая)`,
    };
  }
  if (r.status !== 200) return { error: `HTTP ${r.status} от raw.githubusercontent.com` };
  const version = r.body.trim().split('\n')[0].trim();
  if (!/^v?\d+\.\d+\.\d+/.test(version)) {
    return { error: `неожиданное содержимое VERSION: «${version.slice(0, 40)}»` };
  }
  return { version: version.replace(/^v/, ''), source: 'raw.githubusercontent.com', repo: cfg.repo };
}

function cachePath(factory) {
  return path.join(factory, CACHE_DIR, 'update.json');
}

function readCache(factory) {
  try {
    return JSON.parse(read(cachePath(factory)) || 'null');
  } catch {
    return null;
  }
}

function writeCache(factory, data) {
  const file = cachePath(factory);
  mkdirp(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function cacheAgeHours(cache) {
  if (!cache?.checked_at) return Infinity;
  const t = Date.parse(cache.checked_at);
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 36e5;
}

/** Одна строка для `sp status`: только кэш, без сети. */
function updateLine(factory) {
  const cache = readCache(factory);
  const local = localVersion(factory);
  if (!cache) return 'не проверялось (sp update)';
  if (local && cache.local && cache.local !== local) {
    return `не проверялось для ${local} (sp update)`;
  }
  const age = cacheAgeHours(cache);
  const when = Number.isFinite(age) ? `${Math.round(age)} ч назад` : 'давно';
  if (cache.status === 'outdated') return `${cache.local} → ${cache.remote} доступно (${when})`;
  if (cache.status === 'current') return `${cache.local} — последняя (${when})`;
  return `не удалось проверить: ${cache.detail || 'причина неизвестна'}`;
}

function updateHint(args, factory, local, cfg) {
  if (isGitClone(factory)) {
    return [
      `git -C "${factory}" pull --ff-only`,
      'node SEED/sp-tools/sp.mjs rules --sync   # адаптеры IDE под новую конституцию',
      'node SEED/sp-tools/sp.mjs doctor --strict',
    ];
  }
  return [
    '# установка копированием: заменить канон, сохранив INPUT/ и OUTPUT/',
    `git clone --depth 1 https://github.com/${cfg.repo}.git /tmp/witness-done-new`,
    `cp -r /tmp/witness-done-new/{VERSION,README.md,ORCHESTRATOR.md,PROFILES.md,AGENTS.md,run.sh,validate.sh,catalogs,PIPELINE,SEED,TEMPLATES,LIBRARY} "${factory}/"`,
    'node SEED/sp-tools/sp.mjs rules --sync',
  ];
}

async function cmdUpdate(args) {
  const factory = args.factory;
  const cfg = loadUpdateConfig(factory);
  const local = localVersion(factory);
  const write = (payload) => {
    if (args.json) console.log(JSON.stringify(payload, null, 2));
  };

  if (local === null) {
    write({ status: 'unknown', detail: `нет ${path.join(factory, 'VERSION')}` });
    console.error(`Не найден VERSION в ${factory} — это не корень фабрики?`);
    return 3;
  }
  if (!cfg) {
    write({ status: 'unknown', local, detail: `нет или битый ${UPDATE_CONFIG}` });
    console.error(`Нет ${UPDATE_CONFIG} — неизвестно, откуда брать версии.`);
    return 3;
  }

  const cache = readCache(factory);
  if (args.offline) {
    const status = cache?.remote
      ? semverCmp(local, cache.remote) < 0
        ? 'outdated'
        : 'current'
      : 'unknown';
    if (!args.json) {
      console.log('Witness Done update (offline)');
      console.log(`локально:  ${local}`);
      console.log(`из кэша:   ${cache?.remote || '—'} (проверено: ${cache?.checked_at || 'никогда'})`);
      console.log(`статус:    ${status === 'outdated' ? 'доступно обновление' : status === 'current' ? 'актуально' : 'неизвестно'}`);
    }
    write({ status, local, remote: cache?.remote || null, offline: true });
    return status === 'outdated' ? 2 : status === 'current' ? 0 : 3;
  }

  if (!args.noCache && cache && cache.status !== 'unknown' && cacheAgeHours(cache) < 24 && cache.local === local) {
    const hints = cache.status === 'outdated' && cache.remote ? updateHint(args, factory, local, cfg) : null;
    if (!args.json) {
      console.log('Witness Done update');
      console.log(`локально:  ${local}`);
      console.log(`удалённо:  ${cache.remote || '—'} (${cache.source}, кэш ${Math.round(cacheAgeHours(cache))} ч)`);
      console.log(`статус:    ${cache.status === 'outdated' ? 'доступно обновление' : cache.status === 'current' ? 'актуально' : 'неизвестно'}`);
      if (hints) {
        console.log('обновиться:');
        for (const h of hints) console.log(`  ${h}`);
      }
      console.log('Кэш свежий (TTL 24 ч). Принудительная проверка: sp update --no-cache');
    } else {
      write({ status: cache.status, local, remote: cache.remote, source: cache.source, cached: true, commands: hints });
    }
    return cache.status === 'outdated' ? 2 : cache.status === 'current' ? 0 : 3;
  }

  let remote = remoteVersionFromGit(factory, cfg);
  if (!remote || remote.error) {
    const viaHttp = await remoteVersionFromHttp(cfg, args.timeout);
    if (!viaHttp.error) remote = viaHttp;
    else if (!remote) remote = viaHttp;
  }

  if (!remote || remote.error) {
    const detail = remote?.error || 'неизвестная ошибка';
    writeCache(factory, {
      checked_at: new Date().toISOString(),
      local,
      remote: cache?.remote || null,
      source: 'none',
      repo: cfg.repo,
      status: 'unknown',
      detail,
    });
    write({ status: 'unknown', local, detail, repo: cfg.repo });
    if (!args.json) {
      console.error('Witness Done update');
      console.error(`локально:  ${local}`);
      console.error(`статус:    не удалось проверить — ${detail}`);
      console.error('Обновление не блокирует работу: проверка необязательна.');
    }
    return 3;
  }

  const cmp = semverCmp(local, remote.version);
  const status = cmp < 0 ? 'outdated' : 'current';
  writeCache(factory, {
    checked_at: new Date().toISOString(),
    local,
    remote: remote.version,
    source: remote.source,
    repo: cfg.repo,
    status,
    detail: null,
  });

  const install = isGitClone(factory) ? 'git clone' : 'копия';
  const hints = status === 'outdated' ? updateHint(args, factory, local, cfg) : null;

  if (args.json) {
    write({
      status,
      local,
      remote: remote.version,
      source: remote.source,
      repo: cfg.repo,
      install,
      commands: hints,
    });
    return status === 'outdated' ? 2 : 0;
  }

  console.log('Witness Done update');
  console.log(`локально:  ${local}   (${factory})`);
  console.log(`удалённо:  ${remote.version}   (${cfg.repo}@${cfg.branch}, ${remote.source})`);
  console.log(`установка: ${install}`);
  console.log(`статус:    ${status === 'outdated' ? 'доступно обновление' : 'актуально'}`);
  if (hints) {
    console.log('обновиться:');
    for (const h of hints) console.log(`  ${h}`);
  }
  return status === 'outdated' ? 2 : 0;
}

// ---------------------------------------------------------------- делегирование

function delegate(args, bin) {
  const file = path.join(args.factory, 'SEED', 'sp-tools', bin);
  const local = path.join(__dirname, bin);
  const target = fs.existsSync(local) ? local : file;
  if (!fs.existsSync(target)) {
    console.error(`Не найден ${bin} в ${path.dirname(target)}`);
    return 1;
  }
  const extra = args.help ? ['--help'] : [];
  const r = spawnSync(
    process.execPath,
    [target, ...args.rest, ...extra, '--root', args.root, '--factory', args.factory],
    { stdio: 'inherit' },
  );
  return r.status ?? 1;
}

// ---------------------------------------------------------------- main

function main() {
  return Promise.resolve().then(async () => {
  const args = parseArgs(process.argv);
  if (!args.cmd) {
    help();
    return args.help ? 0 : 1;
  }
  if (args.help && args.cmd !== 'verify' && args.cmd !== 'retrieve') {
    help();
    return 0;
  }
  const outRoot = outputDir(args.root, args.factory);

  switch (args.cmd) {
    case 'status':
      return cmdStatus(args, outRoot);
    case 'intake':
      return cmdIntake(args, outRoot, args.factory);
    case 'next':
      return cmdNext(args, outRoot);
    case 'decide':
      return cmdDecide(args, outRoot, args.factory);
    case 'close':
      return cmdClose(args, outRoot);
    case 'journal':
      return cmdJournal(args, outRoot, args.factory);
    case 'review':
      return cmdReview(args, outRoot);
    case 'progress':
      return cmdProgress(args, outRoot, args.factory);
    case 'feedback':
      return cmdFeedback(args, outRoot, args.factory);
    case 'rules':
      return cmdRules(args, outRoot);
    case 'doctor':
      return cmdDoctor(args, outRoot);
    case 'update':
      return cmdUpdate(args);
    case 'verify':
      return delegate(args, 'sp-verify.mjs');
    case 'retrieve':
      return delegate(args, 'sp-retrieve.mjs');
    default:
      help();
      return 1;
  }
  });
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`sp: ${err && err.message ? err.message : err}`);
    process.exit(1);
  },
);
