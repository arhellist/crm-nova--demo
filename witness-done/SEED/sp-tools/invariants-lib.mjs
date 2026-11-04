/**
 * invariants-lib — глобальные инварианты проекта (`OUTPUT/docs/project-invariants.md`)
 *
 * Правило живёт в одном файле и применяется детерминированным селектором: область (`module`)
 * и уровень задания. «Умное» угадывание здесь запрещено: ложное применение хуже пропуска.
 * Канон: `catalogs/invariants.md`.
 */
import fs from 'node:fs';
import path from 'node:path';

export const INVARIANTS_REL = 'docs/project-invariants.md';

const KV_RE = /^\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|$/;

function blocks(text) {
  const out = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const h = line.match(/^###\s+(INV-\d+)\s*[—–-]?\s*(.*)$/);
    if (h) {
      if (cur) out.push(cur);
      cur = { id: h[1], title: h[2].trim(), fields: {}, body: [] };
      continue;
    }
    if (!cur) continue;
    if (/^##\s/.test(line)) {
      out.push(cur);
      cur = null;
      continue;
    }
    cur.body.push(line);
    const kv = line.match(KV_RE);
    if (kv && kv[1] && !/^-+$/.test(kv[1]) && !/^Поле$/i.test(kv[1])) {
      cur.fields[kv[1].toLowerCase()] = kv[2].trim();
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Уровни вида `L2+`, `L1+`, `L3`, `L2/L3`. */
function levelMatches(spec, level) {
  const s = String(spec || 'L1+').toUpperCase().replace(/\s/g, '');
  if (!s || s === '—' || s === '-') return true;
  const want = Number(String(level).replace(/\D/g, '')) || 1;
  const plus = s.match(/^L(\d)\+$/);
  if (plus) return want >= Number(plus[1]);
  const parts = s.split(/[/,]/).filter(Boolean);
  return parts.some((p) => {
    const m = p.match(/^L(\d)(\+)?$/);
    if (!m) return false;
    return m[2] ? want >= Number(m[1]) : want === Number(m[1]);
  });
}

/** Области вида `all`, `module:events,billing`. */
function areaMatches(spec, module) {
  const s = String(spec || 'all').trim().toLowerCase();
  if (!s || s === 'all') return true;
  const m = s.match(/^module:\s*(.+)$/);
  if (!m) return false;
  const mods = m[1].split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  if (!module) return false;
  return mods.includes(String(module).trim().toLowerCase());
}

function parseWaiver(raw) {
  const s = String(raw || '').trim();
  if (!s || s === '—' || s === '-' || /^нет$/i.test(s)) return null;
  const reason = (s.match(/причина\s*[:—-]\s*([^;]+)/i) || [])[1];
  const until = (s.match(/(?:до|срок)\s*[:—-]\s*(\d{4}-\d{2}-\d{2})/i) || [])[1];
  return { raw: s, reason: reason ? reason.trim() : null, until: until || null };
}

export function parseInvariants(text) {
  return blocks(text || '').map((b) => ({
    id: b.id,
    title: b.title,
    area: b.fields['область'] || 'all',
    levels: b.fields['уровни'] || b.fields['уровень'] || 'L1+',
    check: b.fields['проверка'] || null,
    waiver: parseWaiver(b.fields['waiver'] || b.fields['исключение']),
  }));
}

/** `outRoot` — каталог OUTPUT проекта: каталог инвариантов лежит в нём, а не в корне. */
export function loadInvariants(outRoot) {
  const p = path.join(outRoot, INVARIANTS_REL);
  if (!fs.existsSync(p)) return { file: p, exists: false, items: [] };
  return { file: p, exists: true, items: parseInvariants(fs.readFileSync(p, 'utf8')) };
}

/** Просроченный waiver — провал: исключение не должно становиться вечным. */
export function waiverState(inv, today = new Date()) {
  if (!inv.waiver || !inv.waiver.until) return { active: false, expired: false };
  const now = new Date(today.toISOString().slice(0, 10));
  const until = new Date(inv.waiver.until);
  return { active: true, expired: !(until >= now) };
}

/**
 * Выбор инвариантов для задания: область из FIT_CHECKS `module` + уровень.
 * Возвращает выбранные и пропущенные по селектору — чтобы в акте было видно, что именно решало.
 */
export function selectInvariants(outRoot, { module, level }) {
  const loaded = loadInvariants(outRoot);
  const selected = [];
  const skipped = [];
  for (const inv of loaded.items) {
    if (areaMatches(inv.area, module) && levelMatches(inv.levels, level)) selected.push(inv);
    else skipped.push(inv.id);
  }
  return { ...loaded, selected, skipped };
}

/**
 * Проверка каталога как файла: дубли ID, waiver без причины или срока.
 * Не проверяет применение к заданиям — это делает pre_ci по конкретному D.
 */
export function catalogIssues(outRoot) {
  const loaded = loadInvariants(outRoot);
  const issues = [];
  if (!loaded.exists) return issues;
  const seen = new Set();
  for (const inv of loaded.items) {
    if (seen.has(inv.id)) issues.push(`${inv.id}: ID объявлен дважды`);
    seen.add(inv.id);
    if (!inv.area || inv.area === '—') issues.push(`${inv.id}: не указана область (all | module:…)`);
    if (inv.waiver) {
      if (!inv.waiver.reason) issues.push(`${inv.id}: waiver без причины`);
      if (!inv.waiver.until) issues.push(`${inv.id}: waiver без срока (до YYYY-MM-DD)`);
      else if (waiverState(inv).expired) issues.push(`${inv.id}: waiver истёк ${inv.waiver.until}`);
    }
  }
  return issues;
}
