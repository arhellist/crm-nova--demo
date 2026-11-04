/**
 * evidence-lib — печать и проверка актов VerificationTax
 *
 * Общий модуль sp.mjs и sp-verify.mjs: одна реализация хеширования, одна трактовка review.
 * Канон: catalogs/verification-tax.md («Hash-bound evidence», «Review-артефакт»).
 * Зависимостей нет: только встроенные модули Node ≥18.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const REVIEW_VERDICTS = ['supports', 'does_not_support', 'unclear'];

/**
 * Служебные каталоги: их изменения не относятся к коду задания.
 * Живые правила и адаптеры тоже здесь: их пишет `sp rules --sync`, иначе `doctor --strict`
 * и `pre_ci` считали бы собственную установку фабрики «кодом вне PRODUCES» (DEC-024).
 */
export const BOOKKEEPING_PREFIXES = [
  'OUTPUT/',
  'journal/',
  'spec-state/',
  'witness-done/OUTPUT/',
  '.witness-done-work/',
  'AGENTS.md',
  '.cursorrules',
  'CLAUDE.md',
  'GEMINI.md',
  '.cursor/',
  '.github/copilot-instructions.md',
  '.clinerules/',
  '.devin/',
  '.junie/',
  '.kiro/',
  '.aider.conf.yml',
  '.claude/commands/',
  '.gemini/commands/',
];

export function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** Корень git-репозитория, если git доступен и каталог внутри рабочего дерева. */
export function gitToplevel(dir) {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) return null;
  const out = (r.stdout || '').trim();
  return out || null;
}

/**
 * PROJECT_ROOT по умолчанию (DEC-033).
 *
 * CLI стоит либо в корне проекта (`node witness-done/SEED/...`), либо в самой фабрике
 * (`cd witness-done && node SEED/...`). Раньше sp-verify брал `cwd` и из каталога фабрики
 * молча не находил файлы `PRODUCES` — это выглядело как провал приёмки, а не как ошибка пути.
 * Порядок: git-корень (он и есть проект) → имя папки фабрики `witness-done` → `cwd`.
 * Корень канона (git-корень совпал с фабрикой) остаётся собой.
 */
export function resolveProjectRoot(cwd, factory) {
  const f = path.resolve(factory);
  const top = gitToplevel(cwd);
  if (top) {
    const t = path.resolve(top);
    return t === f ? f : t;
  }
  if (path.basename(f) === 'witness-done') return path.dirname(f);
  return cwd;
}

/**
 * Ярлыки неполноты: объём нельзя описывать «степенью готовности».
 * Канон: catalogs/completeness-policy.md («Запрет ярлыков неполноты»).
 * `v1` сам по себе не запрещён — запрещён `v1` как статус готовности («v1 без…»).
 */
export const INCOMPLETENESS_LABELS = [
  { re: /\bmvp\b/i, why: 'MVP' },
  { re: /\bpoc\b|proof[\s-]of[\s-]concept/i, why: 'PoC' },
  // «beta»/«v0.x» запрещены как объём поставки; как фича («beta-доступ») — нет.
  { re: /(?:beta|бета)[-\s]?(?:верси|этап|релиз)|(?:beta|бета)\s+как\s+/i, why: 'beta как объём' },
  { re: /\bv0\.\d+\b\s*(?:верси|этап|релиз|как)/i, why: 'v0.x как объём' },
  { re: /пока\s+без|без\s+[^.,;\n]{0,30}\s+на\s+первом\s+этапе/i, why: '«пока без…»' },
  /**
   * Кириллица не входит в `\w` (DEC-036): `упрощ[её]нн\w*\s+верси` не совпадал с
   * «упрощённая версия», то есть ярлык неполноты по-русски проходил гейт качества.
   */
  { re: /упрощ[её]нн[\wА-Яа-яЁё-]*\s+верси/i, why: '«упрощённая версия»' },
  { re: /\bv1\s+(без|как\s+статус)/i, why: 'v1 как статус' },
];

/** Строка опровергает ярлык (запрет/отказ/вне скоупа) — это не нарушение. */
const LABEL_REFUTED =
  /запрещ|недопустим|out\s+of\s+scope|improvement-backlog|(?:^|[^\wА-Яа-яЁё])не\s+(«|")?(mvp|poc|beta)/i;

/**
 * Находит ярлыки неполноты в тексте. Возвращает список `{line, why, text}`.
 * Строка с опровержением («MVP запрещён», «не MVP») не считается нарушением:
 * правило должно цитироваться в правилах проекта, иначе его нельзя объяснить.
 */
export function findIncompletenessLabels(text) {
  const out = [];
  String(text || '')
    .split('\n')
    .forEach((line, i) => {
      if (LABEL_REFUTED.test(line)) return;
      for (const l of INCOMPLETENESS_LABELS) {
        if (l.re.test(line)) {
          out.push({ line: i + 1, why: l.why, text: line.trim().slice(0, 160) });
          return;
        }
      }
    });
  return out;
}

export function fileDigest(abs) {
  try {
    return sha256(fs.readFileSync(abs));
  } catch {
    return null;
  }
}

export function gitHead(root) {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? (r.stdout || '').trim() : null;
}

/** Дерево закоммиченного состояния: авторитетная привязка для актов без `PRODUCES` (смоук, релиз). */
export function gitTree(root) {
  const r = spawnSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? (r.stdout || '').trim() : null;
}

/**
 * Glob → RegExp. Единственная реализация на всю фабрику (DEC-024).
 * `**\/` — ноль или больше каталогов (`src/**\/*.ts` обязан совпадать и с `src/index.ts`),
 * `**` — любая глубина, `*` — один сегмент, `?` — один символ.
 */
export function globToRe(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const re = esc
    .replace(/\*\*\/+/g, '\u0001')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0001/g, '(?:[^/]+/)*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${re}$`);
}

/** Все файлы проекта: нужны, чтобы раскрыть glob в конкретные пути. */
function walkFiles(root, limit = 4000) {
  const out = [];
  const walk = (dir, rel) => {
    if (out.length >= limit) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= limit) return;
      if (['.git', 'node_modules', '.witness-done-work', 'dist', 'build'].includes(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else out.push(r);
    }
  };
  walk(root, '');
  return out;
}

/**
 * PRODUCES → конкретные файлы. Glob раскрывается здесь один раз, чтобы хеш, сверка diff
 * и уверенность говорили об одних и тех же путях (DEC-015).
 * Запись, не совпавшая ни с одним файлом, в результат не попадает: её отсутствие ловит pre_ci.
 */
export function expandProduces(root, produces) {
  const out = new Set();
  const files = walkFiles(root);
  for (const raw of produces || []) {
    const p = String(raw || '').replace(/^\.\//, '').trim();
    if (!p || p.startsWith('OUTPUT/')) continue;
    if (!/[*?]/.test(p)) {
      out.add(p);
      continue;
    }
    const re = globToRe(p);
    for (const f of files) if (re.test(f)) out.add(f);
  }
  return [...out].sort();
}

/** Изменены ли файлы PRODUCES относительно HEAD. Пустой список — сравнивать нечего. */
export function producesDirty(root, produces) {
  if (!produces.length) return null;
  const r = spawnSync('git', ['status', '--porcelain', '-uall', '--', ...produces], {
    cwd: root,
    encoding: 'utf8',
  });
  if (r.status !== 0) return null;
  return (r.stdout || '').trim().length > 0;
}

/**
 * code_hash — якорь акта: коммит, флаг незакоммиченных правок и отпечаток содержимого PRODUCES.
 * Отпечаток ловит правку кода без коммита; git_head — правку после коммита.
 */
export function codeHash(root, produces) {
  const list = expandProduces(root, produces);
  const entries = list.map((p) => {
    const d = fileDigest(path.join(root, p));
    return `${p}:${d === null ? 'absent' : d}`;
  });
  const out = {
    git_head: gitHead(root),
    git_dirty: producesDirty(root, list),
    produces: list,
    // Без PRODUCES (смоук, релиз) пустой дайджест был бы sha256 пустоты — одинаковым для всех
    // прогонов и потому бесполезным. Привязка тогда — дерево коммита (DEC-018).
    git_tree: gitTree(root),
  };
  if (list.length) out.produces_digest = sha256(entries.join('\n'));
  return out;
}

/**
 * Печать акта. `evidence_hash` считается по тому же JSON, который пишется на диск, минус само
 * поле — поэтому пересчёт на чтении сходится, а любая правка байтов даёт расхождение.
 */
export function seal(root, data) {
  const body = { ...data };
  delete body.evidence_hash;
  if (!body.code_hash) body.code_hash = codeHash(root, (body.fit && body.fit.produces) || []);
  body.evidence_hash = sha256(JSON.stringify(body, null, 2));
  return body;
}

/** Пересчёт хеша прочитанного акта: сравнение с `evidence_hash` из файла. */
export function recomputeEvidenceHash(data) {
  const body = { ...data };
  delete body.evidence_hash;
  return sha256(JSON.stringify(body, null, 2));
}

function relProducesDiffs(root, code) {
  const issues = [];
  if (!code || typeof code !== 'object') {
    issues.push('code_hash отсутствует — акт не привязан к коду');
    return issues;
  }
  // git_head — факт «на каком коммите писался акт», а не проверка: коммит самого акта
  // сдвигает HEAD, поэтому равенство с текущим HEAD ничего не доказывает (DEC-014).
  const produces = Array.isArray(code.produces) ? code.produces : [];
  if (produces.length) {
    const now = codeHash(root, produces);
    if (now.produces_digest !== code.produces_digest) {
      issues.push('code_hash.produces_digest не совпадает: PRODUCES изменены после приёмки');
    }
    // Акт, где заявленный файл отсутствует на диске, не может быть актом о сделанной работе.
    // Без этого пересчёт дайджеста тавтологичен: «absent» сходится с «absent» (DEC-024).
    const absent = now.produces.filter((p) => fileDigest(path.join(root, p)) === null);
    if (absent.length && code.produces_digest) {
      issues.push(`code_hash.produces содержит отсутствующие файлы: ${absent.join(', ')}`);
    }
  }
  return issues;
}

/** Состояние файла акта в git: закоммичен и не изменён — значит печать подтверждена историей. */
function gitFileState(root, abs) {
  const rel = path.relative(root, abs).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..')) return { tracked: false, dirty: false, rel };
  const tracked =
    spawnSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: root, encoding: 'utf8' })
      .status === 0;
  if (!tracked) return { tracked: false, dirty: false, rel };
  const st = spawnSync('git', ['status', '--porcelain', '-uall', '--', rel], {
    cwd: root,
    encoding: 'utf8',
  });
  const dirty = st.status === 0 && (st.stdout || '').trim().length > 0;
  return { tracked, dirty, rel };
}

/**
 * Независимая проверка акта: целостность байтов и привязка к текущему коду.
 * Транскрипт создателя не нужен — только файл акта и дерево проекта.
 */
export function verifyEvidenceFile(root, file) {
  const abs = path.resolve(root, file);
  if (!fs.existsSync(abs)) return { ok: false, file: abs, issues: [`акт не найден: ${abs}`] };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    return { ok: false, file: abs, issues: [`акт не читается как JSON: ${e.message}`] };
  }
  const issues = [];
  if (!data.evidence_hash) {
    issues.push('нет поля evidence_hash — акт не был опечатан (пересоздать гейтом)');
  } else if (recomputeEvidenceHash(data) !== data.evidence_hash) {
    issues.push('evidence_hash не совпадает: содержимое акта изменено после приёмки');
  }
  issues.push(...relProducesDiffs(root, data.code_hash));
  // Печать подтверждается git: закоммиченный и не изменённый акт нельзя подменить,
  // не оставив следа в истории. Незакоммиченный — законный черновик, но не якорь.
  const state = gitFileState(root, abs);
  if (state.tracked && state.dirty) {
    issues.push(`акт изменён в рабочем дереве после коммита (${state.rel}) — верни коммит или пересоздай акт`);
  }
  // Runtime trace: хеш входит в цепочку акта — файл не подменить после приёмки
  if (data.trace && data.trace.hash) {
    const tf = path.join(path.dirname(abs), path.basename(data.trace.file || `${data.d || ''}.trace.json`));
    if (!fs.existsSync(tf)) issues.push(`trace: акт ссылается на ${path.basename(tf)}, файла нет`);
    else if (sha256(fs.readFileSync(tf)) !== data.trace.hash) {
      issues.push('trace: хеш трейса не совпадает — файл изменён после приёмки');
    }
  }
  return {
    ok: issues.length === 0,
    file: abs,
    d: data.d || null,
    gate: data.gate || null,
    tax_pass: data.tax_pass === true,
    evidence_hash: data.evidence_hash || null,
    code_hash: data.code_hash || null,
    committed: state.tracked && !state.dirty,
    issues,
  };
}

export function reviewPath(outRoot, d) {
  return path.join(outRoot, 'evidence', `${d}.review.json`);
}

export function readReview(outRoot, d) {
  const p = reviewPath(outRoot, d);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { __broken: true };
  }
}

/**
 * Проверка review-артефакта против акта.
 * Review привязан к `code_hash.produces_digest` и набору Axx, а не к байтам акта:
 * повторный прогон меняет timestamp и обесценивал бы review на ровном месте.
 */
export function reviewCheck(root, outRoot, d, evidence) {
  const issues = [];
  const review = readReview(outRoot, d);
  if (!review) {
    return { ok: false, required: true, review: null, issues: [`review отсутствует: evidence/${d}.review.json`] };
  }
  if (review.__broken) {
    return { ok: false, required: true, review: null, issues: [`evidence/${d}.review.json не читается как JSON`] };
  }
  if (!REVIEW_VERDICTS.includes(review.verdict)) {
    issues.push(`verdict «${review.verdict || '—'}» не из ${REVIEW_VERDICTS.join('|')}`);
  } else if (review.verdict !== 'supports') {
    issues.push(`verdict=${review.verdict}: акт не подтверждён`);
  }
  if (!review.reviewer || !String(review.reviewer).trim()) {
    issues.push('reviewer пуст — ревьюер не назван');
  }
  const producer = evidence && evidence.producer;
  if (producer && review.reviewer && String(review.reviewer).trim() === String(producer).trim()) {
    issues.push(`reviewer совпадает с producer (${producer}) — независимой проверки нет`);
  }
  const code = evidence && evidence.code_hash;
  const evDigest = code && code.produces_digest;
  const rvDigest = review.code_hash && review.code_hash.produces_digest;
  if (!review.code_hash) {
    // Без якоря review не привязан ни к какой редакции кода: старый отзыв проходил бы
    // для любого следующего акта. Отсутствие привязки — провал, а не пропуск (DEC-024).
    issues.push('review без code_hash — не привязан к акту');
  } else if (evDigest) {
    if (!rvDigest) issues.push('review без code_hash.produces_digest — не привязан к коду');
    else if (rvDigest !== evDigest) {
      issues.push('review относится к другому коду: produces_digest не совпадает с актом');
    }
  }
  const evIds = ((evidence && evidence.fit && evidence.fit.acceptance_ids) || [])
    .map((x) => String(x).toUpperCase())
    .sort();
  const rvIds = (review.acceptance_ids || []).map((x) => String(x).toUpperCase()).sort();
  if (evIds.length && evIds.join(',') !== rvIds.join(',')) {
    issues.push(`review сверял другие Axx: ${rvIds.join(',') || '[]'} != ${evIds.join(',')}`);
  }
  return { ok: issues.length === 0, required: true, review, issues };
}

/** Проверка изменения целиком: свежесть и валидность актов всех `done`. */
export function evidenceIssuesForDone(root, outRoot, done) {
  const issues = [];
  for (const d of done) {
    const r = verifyEvidenceFile(root, path.join(outRoot, 'evidence', `${d}.json`));
    for (const i of r.issues) issues.push(`${d}: ${i}`);
  }
  return issues;
}

// ---------------------------------------------------------------- уверенность

function isTestFile(rel) {
  return /(^|\/)(tests?|__tests__)\//.test(rel) || /\.(test|spec)\.[^.]+$/.test(rel) || /_test\.[^.]+$/.test(rel);
}

function walkProject(root, limit = 4000) {
  const out = [];
  const walk = (dir, rel) => {
    if (out.length >= limit) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= limit) return;
      if (['.git', 'node_modules', '.witness-done-work', 'dist', 'build'].includes(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else out.push(r);
    }
  };
  walk(root, '');
  return out;
}

/** Текст тестов: маленький индекс «какие Axx вообще упомянуты в тестах». */
function testIdIndex(root) {
  const ids = new Set();
  const files = walkProject(root).filter((f) => isTestFile(f) && !BOOKKEEPING_PREFIXES.some((p) => f.startsWith(p)));
  for (const f of files.slice(0, 500)) {
    let text;
    try {
      const abs = path.join(root, f);
      if (fs.statSync(abs).size > 512 * 1024) continue;
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    for (const m of text.matchAll(/\bA\d{2,}\.\d+\b/g)) ids.add(m[0].toUpperCase());
  }
  return ids;
}

/**
 * coverage_confidence — статистическая оценка вместо категорического «готово».
 * 0.5 * доля PRODUCES с актом + 0.3 * доля Axx с тестами + 0.2 * доля L3 с trace.
 * Компонент с нулевым знаменателем — не «ноль доказательств», а «нечего оценивать»:
 * его вес перераспределяется между определёнными компонентами (DEC-017). Иначе проект
 * без L3 навсегда упирался бы в 0.8 и назывался «средним» при полном покрытии.
 */
export function coverageConfidence(root, outRoot, done) {
  const testIds = testIdIndex(root);
  let producesTotal = 0;
  let producesWithAct = 0;
  let axxTotal = 0;
  let axxWithTest = 0;
  let l3Total = 0;
  let l3WithTrace = 0;
  for (const d of done) {
    const p = path.join(outRoot, 'evidence', `${d}.json`);
    if (!fs.existsSync(p)) continue;
    let j;
    try {
      j = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      continue;
    }
    const produces = expandProduces(root, (j.fit && j.fit.produces) || []);
    for (const file of produces) {
      producesTotal += 1;
      if (j.tax_pass === true && fs.existsSync(path.join(root, file))) producesWithAct += 1;
    }
    for (const id of (j.fit && j.fit.acceptance_ids) || []) {
      axxTotal += 1;
      if (testIds.has(String(id).toUpperCase())) axxWithTest += 1;
    }
    if (String(j.level || '').toUpperCase() === 'L3') {
      l3Total += 1;
      if (j.trace && j.trace.required && j.trace.ok) l3WithTrace += 1;
    }
  }
  const share = (a, b) => (b > 0 ? a / b : 0);
  const producesShare = share(producesWithAct, producesTotal);
  const axxShare = share(axxWithTest, axxTotal);
  const traceShare = share(l3WithTrace, l3Total);
  const parts = [
    { key: 'produces_with_act', weight: 0.5, share: producesShare, total: producesTotal, confirmed: producesWithAct },
    { key: 'acceptance_with_tests', weight: 0.3, share: axxShare, total: axxTotal, confirmed: axxWithTest },
    { key: 'l3_with_trace', weight: 0.2, share: traceShare, total: l3Total, confirmed: l3WithTrace },
  ].filter((c) => c.total > 0);
  const weightSum = parts.reduce((s, c) => s + c.weight, 0);
  const value =
    weightSum > 0
      ? Math.round((parts.reduce((s, c) => s + c.weight * c.share, 0) / weightSum) * 100) / 100
      : 0;
  const residual =
    value >= 0.85
      ? 'низкий: почти всё заявленное подтверждено актами и тестами'
      : value >= 0.6
      ? 'средний: часть заявленного держится на словах, а не на артефактах'
      : 'высокий: значительная часть работы не подтверждена воспроизводимыми артефактами';
  const applied = Object.fromEntries(
    parts.map((c) => [c.key, { share: Math.round(c.share * 100) / 100, confirmed: c.confirmed, total: c.total, weight: Math.round((c.weight / weightSum) * 100) / 100 }]),
  );
  return {
    value,
    residual_risk: residual,
    components: {
      produces_with_act: { share: Math.round(producesShare * 100) / 100, confirmed: producesWithAct, total: producesTotal },
      acceptance_with_tests: { share: Math.round(axxShare * 100) / 100, confirmed: axxWithTest, total: axxTotal },
      l3_with_trace: { share: Math.round(traceShare * 100) / 100, confirmed: l3WithTrace, total: l3Total },
    },
    weights_applied: applied,
    note: weightSum > 0
      ? 'статистическая оценка, а не замена tax_pass: веса перераспределены по компонентам с непустым знаменателем'
      : 'статистическая оценка, а не замена tax_pass: доказательств для оценки нет',
  };
}
