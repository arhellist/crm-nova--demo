/**
 * progress-lib — один разбор `roadmaps/progress.md` для всех гейтов.
 *
 * Зачем отдельный модуль: до v1.24 таблицу парсили четыре раза и все четыре — точным
 * совпадением ячейки. Строка `done ✅` или `**D01**` выпадала из проверок молча, и релиз
 * проходил при нуле выполненных заданий. Дубль логики → дубль дыры.
 *
 * Правило: **не понял строку — это провал, а не пропуск**. Строка с id задания и
 * нераспознанным статусом даёт issue; таблица без строк заданий даёт issue.
 *
 * Зависимостей нет: только встроенные модули.
 */

export const PROGRESS_STATUSES = ['not_started', 'in_progress', 'needs_rework', 'blocked', 'done'];

/** Длинные статусы первыми: `not_started` не должен матчиться как `not`. */
const BY_LENGTH = [...PROGRESS_STATUSES].sort((a, b) => b.length - a.length);

/** Ячейка без markdown-разметки: `**done** ✅` → `done`. Подчёркивания не трогаем — они часть статуса. */
export function normCell(raw) {
  return String(raw || '')
    .replace(/[*`~]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Id задания в ячейке: `D01`, `**D01**`, `d1`? Нет — только D + цифры, регистр не важен. */
export function idOf(raw) {
  const n = normCell(raw);
  const m = n.match(/^D(\d{1,4})$/i);
  return m ? `D${m[1].padStart(2, '0')}` : null;
}

/**
 * Статус ячейки. Принимается украшение (`done ✅`, `done (10b)`, `DONE`),
 * но только когда статус стоит **в начале** ячейки: описание вида
 * «схема готова, done» статусом не считается.
 */
export function statusOf(raw) {
  const n = normCell(raw)
    .toLowerCase()
    // оставляем латиницу, цифры и разделители — эмодзи и прочее в статусе не участвуют
    .replace(/[^a-z0-9_ ()/-]/g, '')
    .trim();
  for (const s of BY_LENGTH) {
    if (n === s) return s;
    if (n.startsWith(`${s} `) || n.startsWith(`${s}(`) || n.startsWith(`${s}/`) || n.startsWith(`${s}-`)) return s;
  }
  return null;
}

function cellsOf(line) {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/**
 * Разбор таблицы. Возвращает строки и список проблем разбора.
 * Заголовок и разделитель пропускаются молча: у них нет ни id, ни статуса.
 */
export function parseProgress(text) {
  const rows = [];
  const issues = [];
  const seen = new Map();
  let tableRows = 0;
  for (const line of String(text || '').split('\n')) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = cellsOf(line);
    const id = cells.map(idOf).find(Boolean) || null;
    const statuses = cells.map(statusOf).filter(Boolean);
    if (!id && !statuses.length) continue; // заголовок / разделитель / посторонняя таблица
    tableRows += 1;
    if (!id) {
      issues.push(`строка со статусом «${statuses[0]}» без id задания — непонятно, к какому D относится`);
      continue;
    }
    if (!statuses.length) {
      issues.push(`${id}: статус не распознан — допустимо ${PROGRESS_STATUSES.join(' | ')}`);
      continue;
    }
    if (statuses.length > 1) {
      issues.push(`${id}: несколько статусов в строке (${statuses.join(', ')}) — нужен один`);
      continue;
    }
    if (seen.has(id)) {
      issues.push(`${id}: строка объявлена дважды (см. ${seen.get(id)})`);
      continue;
    }
    seen.set(id, line.trim());
    rows.push({ id, status: statuses[0], cells, line });
  }
  if (tableRows > 0 && rows.length === 0 && issues.length === 0) {
    issues.push('таблица заданий не содержит ни одной строки с id и статусом');
  }
  return { rows, issues };
}

/** Только `done`-задания: единственный законный вход для релиза и смоук-атрибуции. */
export function doneIds(text) {
  return parseProgress(text).rows.filter((r) => r.status === 'done').map((r) => r.id);
}
