/**
 * acceptance-bind — машинная связь «фраза приёмки ↔ тест» (DEC-027).
 *
 * Зачем: до v1.27 связь держалась на договорённости «номер фразы напиши в описании теста».
 * Проверялось только то, что тест-файл существует и прогон зелёный, — то есть зелёный тест
 * про что угодно закрывал любую фразу. Здесь связь становится данными:
 *
 *   1. фраза берётся из таблицы `## ACCEPTANCE` задания и получает отпечаток (digest);
 *   2. тест объявляет фразу явно — `@acceptance A01.2` или ID в имени теста;
 *   3. тест обязан содержать утверждение и не быть пропущенным;
 *   4. тест обязан быть заявлен в PRODUCES задания (иначе это чужой/старый тест);
 *   5. отпечатки попадают в акт: правка фразы после приёмки видна как расхождение.
 *
 * Чего гейт **не** делает: он не доказывает семантику. Он доказывает, что заявленная фраза
 * имеет исполняемое утверждение, что ссылка не висит в пустоте и что фраза не подменилась
 * после приёмки. Что тест проверяет именно смысл фразы — обязанность автора и ревью.
 *
 * Канон: `catalogs/verification-tax.md`, `catalogs/typing-and-tests.md`.
 * Зависимостей нет: только встроенные модули Node ≥18.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expandProduces, sha256 } from './evidence-lib.mjs';

/** Порог: столько файлов ещё читаем при поиске тестов, дальше — только тестовые пути. */
const SCAN_LIMIT = 400;
const MAX_FILE_BYTES = 1024 * 1024;

/**
 * Объявления тестов по семействам языков. Имя теста — первая содержательная группа.
 * Список открыт: незнакомый язык даёт один блок на файл (см. `extractTestBlocks`), а не пропуск.
 */
const DECLARATIONS = {
  js: [
    /^[ \t]*(?:it|test|specify)(?:\.(?:only|skip|todo|concurrent|failing|each\([^)]*\)))?[ \t]*\([ \t]*(['"`])([\s\S]*?)\1/gm,
  ],
  py: [/^[ \t]*(?:async[ \t]+)?def[ \t]+(test[A-Za-z0-9_]*)[ \t]*\(/gm],
  go: [/^func[ \t]+(Test[A-Za-z0-9_]*)[ \t]*\(/gm],
  ruby: [/^[ \t]*it[ \t]+(['"])(.*?)\1/gm],
  rust: [/^[ \t]*(?:pub[ \t]+)?(?:async[ \t]+)?fn[ \t]+(test_[A-Za-z0-9_]*)[ \t]*\(/gm],
  php: [/^[ \t]*(?:public[ \t]+|protected[ \t]+|private[ \t]+)?function[ \t]+(test[A-Za-z0-9_]*)[ \t]*\(/gm],
  java: [/^[ \t]*(?:public|protected|private)[ \t]+(?:static[ \t]+)?(?:void|fun|[\w<>\[\], .?]+)[ \t]+([A-Za-z0-9_]+)[ \t]*\([^)]*\)[ \t]*(?:throws [^{]+)?\{[ \t]*$/gm],
  csharp: [/^[ \t]*public[ \t]+(?:async[ \t]+)?(?:void|Task)[ \t]+([A-Za-z0-9_]+)[ \t]*\(/gm],
  elixir: [/^[ \t]*test[ \t]+(['"])(.*?)\1/gm],
};

const EXT_KIND = [
  [/\.(?:m?js|cjs|tsx?|jsx|vue|svelte)$/i, 'js'],
  [/\.py$/i, 'py'],
  [/\.go$/i, 'go'],
  [/\.rb$/i, 'ruby'],
  [/\.rs$/i, 'rust'],
  [/\.php$/i, 'php'],
  [/\.(?:java|kt|kts|scala|groovy)$/i, 'java'],
  [/\.cs$/i, 'csharp'],
  [/\.(?:ex|exs)$/i, 'elixir'],
];

/**
 * Тесты, которые объявляются атрибутом (`@Test`, `[Fact]`, `#[test]`), а не сигнатурой.
 * Для таких языков атрибут — начало блока: сигнатура может быть без модификатора доступа
 * (JUnit 5, Kotlin), и поиск по `public void` терял бы половину тестов.
 */
const ATTRIBUTE_DECL = {
  java: /^[ \t]*@(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b/gm,
  csharp: /^[ \t]*\[(?:Fact|Theory|Test|TestMethod)\b[^\]]*\]/gm,
  rust: /^[ \t]*#\[(?:tokio::)?test\b[^\]]*\]/gm,
};

/** Имя функции после атрибута: нужно только для отчёта и поиска ID в имени. */
const FN_AFTER_ATTR = /(?:fn|void|fun|Task|function)\s+([A-Za-z0-9_]+)\s*\(/;

/**
 * Утверждение. Набор намеренно широкий и языко-независимый: гейт ищет факт проверки,
 * а не конкретную библиотеку. `expect(1)` без аргументов-проверок всё равно считается —
 * отличить «утверждение о результате» от «утверждения о константе» машинно нельзя.
 */
const ASSERTION = new RegExp(
  [
    '\\bexpect\\s*\\(',
    '\\bassert(?:Equals|Equal|That|True|False|Raises|In|IsNotNone|IsNone|_eq!?|_ne!?|!)\\b',
    '\\bassert(?:\\s*\\()?',
    '\\bt\\.(?:Error|Errorf|Fatal|Fatalf|Fail|FailNow)\\b',
    '\\brequire\\.\\w+\\(',
    '\\bassert\\.\\w+\\(',
    '\\bshould\\b',
    '\\.to(?:Be|Equal|Match|Throw|Have|Contain)\\w*\\b',
    '\\bXCTAssert\\w*',
    '\\bok\\s*\\(',
    '\\bdeepEqual\\b',
    '\\bself\\.assert\\w*',
    '\\bpytest\\.raises\\b',
    '\\bassertRaises\\b',
    '\\bverify\\s*\\(',
    '\\bcheck\\s*\\(',
  ].join('|'),
);

/** Пропущенный тест — не доказательство: `skip`, `todo`, `@Disabled`, `#[ignore]`, `t.Skip`. */
const SKIP = new RegExp(
  [
    '\\.skip\\s*\\(',
    '\\.todo\\s*\\(',
    '\\bxit\\s*\\(',
    '\\bxdescribe\\s*\\(',
    '@(?:unittest\\.)?skip\\b',
    '@pytest\\.mark\\.(?:skip|xfail)',
    '\\bt\\.Skip\\w*\\(',
    '#\\[ignore\\]',
    '@Disabled\\b',
    '@Ignore\\b',
    '\\bpending\\b',
    '\\bmarkTestSkipped\\b',
    '\\bmarkTestIncomplete\\b',
  ].join('|'),
);

/** Тестовый путь по названию: `tests/`, `__tests__/`, `*.test.*`, `*_test.go`, `*Test.java`. */
export function isTestPath(file) {
  const f = String(file || '').replace(/\\/g, '/');
  return (
    /(?:^|\/)(?:tests?|__tests__|spec|e2e|integration)\//i.test(f) ||
    /(?:\.|-|_)(?:test|spec)s?\.[a-z0-9]+$/i.test(f) ||
    /_test\.(?:go|py|rb|exs)$/i.test(f) ||
    /Test\.(?:java|kt|cs|php)$/i.test(f)
  );
}

/** Нормализация фразы: пробелы схлопываются, регистр и слова — нет (правка смысла = другой digest). */
export function normalizePhrase(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Короткий отпечаток фразы. 12 hex достаточно: это не секрет, а метка редакции текста. */
export function phraseDigest(s) {
  return sha256(`acceptance:${normalizePhrase(s)}`).slice(0, 12);
}

/**
 * Таблица `## ACCEPTANCE` → фразы с отпечатками.
 * Понимает и полный шаблон (`| ID | Given | When | Then |`), и короткую форму (`| ID | фраза |`).
 * Пустой блок и `N/A` — законные случаи для L0, а не ошибка.
 */
export function parseAcceptancePhrases(promptText) {
  const m = String(promptText || '').match(/##\s*ACCEPTANCE([\s\S]*?)(?:\n## |$)/i);
  const block = m ? m[1] : '';
  if (!block) return { na: false, rows: [], issues: ['нет секции ## ACCEPTANCE'] };
  if (/^\s*N\/A\b/im.test(block) || /\bN\/A\s*[—\-–]/i.test(block)) {
    return { na: true, rows: [], issues: [] };
  }

  const rows = [];
  const seen = new Set();
  for (const line of block.split('\n')) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim().replace(/^`|`$/g, ''));
    const id = (cells[0] || '').match(/^(A\d+\.\d+)$/i);
    if (!id) continue;
    const key = id[1].toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const rest = cells.slice(1).filter(Boolean);
    const phrase = rest.join(' | ');
    rows.push({
      id: key,
      cells: rest,
      phrase,
      phraseMissing: rest.length === 0,
      digest: rest.length ? phraseDigest(phrase) : null,
      given: rest[0] || null,
      when: rest[1] || null,
      then: rest[2] || null,
    });
  }

  // Строки без таблицы (`A01.1 A01.2 …`) — ID есть, фразы нет. Связывать нечего, и это видно.
  if (rows.length === 0) {
    const bare = [...new Set([...block.matchAll(/\b(A\d+\.\d+)\b/gi)].map((x) => x[1].toUpperCase()))];
    for (const id of bare) {
      rows.push({ id, cells: [], phrase: '', phraseMissing: true, digest: null, given: null, when: null, then: null });
    }
  }
  return { na: false, rows, issues: [] };
}

function kindOf(file) {
  for (const [re, kind] of EXT_KIND) if (re.test(file)) return kind;
  return null;
}

/** Явные объявления фразы: `@acceptance A01.2`, `@acceptance(A01.2)` — в любом комментарии. */
const ANNOTATION = /@acceptance\s*\(?\s*(A\d+\.\d+)\s*\)?/gi;
/** Проверка «в файле есть объявление» — без состояния, в отличие от глобального `ANNOTATION`. */
const HAS_ANNOTATION = /@acceptance\s*\(?\s*A\d+\.\d+/i;

/**
 * Разбор файла на тест-блоки.
 * Незнакомый язык — один блок на файл: лучше проверить грубо, чем пропустить молча.
 */
export function extractTestBlocks(file, text) {
  const kind = kindOf(file) || 'generic';
  const patterns = DECLARATIONS[kind] || [];
  const src = String(text || '');
  const issues = [];

  const marks = [];
  const attrRe = ATTRIBUTE_DECL[kind];
  if (attrRe) {
    attrRe.lastIndex = 0;
    let m;
    while ((m = attrRe.exec(src)) !== null) {
      const after = src.slice(m.index, m.index + 400);
      const name = (after.match(FN_AFTER_ATTR) || [])[1] || m[0].trim();
      marks.push({ index: m.index, lineEnd: m.index + m[0].length, name });
    }
  }
  // Атрибуты есть — они и режут блок; иначе сигнатуры. Смешивать нельзя: сигнатура внутри
  // атрибутного блока разрезала бы тело теста пополам и утверждение уехало бы в следующий блок.
  if (marks.length === 0) {
    for (const re of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) {
        // Имя — последняя определённая группа (в шаблонах с кавычками это вторая).
        const name = [...m].slice(1).filter((g) => g !== undefined).pop() || m[0].trim();
        marks.push({ index: m.index, lineEnd: m.index + m[0].length, name: String(name).trim() });
      }
    }
  }
  marks.sort((a, b) => a.index - b.index);

  const blocks = [];
  if (marks.length === 0) {
    // Файл без распознанных объявлений: считаем одним блоком, если он вообще похож на тест.
    if (isTestPath(file) || HAS_ANNOTATION.test(src)) {
      blocks.push({
        name: path.basename(file),
        kind,
        line: 1,
        body: src,
        declared: false,
      });
      if (!isTestPath(file)) {
        issues.push(`${file}: объявление теста не распознано (${kind}) — проверяется как один блок`);
      }
    }
    return { kind, blocks: finishBlocks(file, blocks), issues };
  }

  marks.forEach((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : src.length;
    // Атрибуты (`@Test`, `#[test]`, `@pytest.mark…`) стоят перед объявлением: тянем до 4 строк назад.
    const before = src.slice(Math.max(0, mark.index - 400), mark.index);
    const attrLines = before.split('\n').slice(-4).join('\n');
    blocks.push({
      name: mark.name,
      kind,
      line: src.slice(0, mark.index).split('\n').length,
      body: `${attrLines}\n${src.slice(mark.index, end)}`,
      declared: true,
    });
  });
  return { kind, blocks: finishBlocks(file, blocks), issues };
}

function finishBlocks(file, blocks) {
  return blocks.map((b) => {
    const annotationIds = [...b.body.matchAll(ANNOTATION)].map((m) => m[1].toUpperCase());
    // ID в самом имени теста — второй законный способ объявить связь.
    const nameIds = [...String(b.name).matchAll(/\b(A\d+\.\d+)\b/gi)].map((m) => m[1].toUpperCase());
    return {
      file,
      name: b.name,
      kind: b.kind,
      line: b.line,
      ids: [...new Set([...annotationIds, ...nameIds])],
      hasAssertion: ASSERTION.test(b.body),
      skipped: SKIP.test(b.body),
    };
  });
}

/** Файлы — кандидаты в тесты: заявленные в PRODUCES (glob раскрыт), существующие, читаемые. */
export function collectTestFiles(root, produces) {
  const expanded = [...expandProduces(root, produces || [])].filter((f) => !f.startsWith('OUTPUT/'));
  const files = [];
  let read = 0;
  for (const rel of expanded) {
    const abs = path.join(root, rel);
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile() || st.size === 0 || st.size > MAX_FILE_BYTES) continue;
    const looksTest = isTestPath(rel);
    if (!looksTest && read >= SCAN_LIMIT) continue;
    if (!looksTest && !kindOf(rel)) continue;
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    read += 1;
    // Внутримодульные тесты (Rust `#[cfg(test)]`, Go `_test.go`, Java `@Test`) тоже считаются.
    if (looksTest || /@acceptance\s*\(?\s*A\d+\.\d+/i.test(text) || /\btest[A-Za-z0-9_]*\s*\(|@Test\b|#\[test\]/.test(text)) {
      files.push({ rel, text });
    }
  }
  return files;
}

/**
 * Главная проверка: все фразы задания ↔ тесты.
 *
 * `exemptIds` — фразы, которые по FIT_CHECKS покрываются внешним контуром (`acceptance_ops`).
 * Освобождение должно быть названо в задании явно: молчаливого скипа нет.
 */
export function bindAcceptance({ root, promptText, produces, exemptIds = [] }) {
  const parsed = parseAcceptancePhrases(promptText);
  const files = collectTestFiles(root, produces);
  const issues = [];

  const blocks = [];
  for (const f of files) {
    const r = extractTestBlocks(f.rel, f.text);
    for (const i of r.issues) issues.push(i);
    blocks.push(...r.blocks);
  }

  const byId = new Map(); // id → [{file, test, line}]
  const phantom = [];
  const hollow = [];
  const skippedHits = [];
  const known = new Set(parsed.rows.map((r) => r.id));

  for (const b of blocks) {
    for (const id of b.ids) {
      if (!known.has(id)) {
        phantom.push({ id, file: b.file, test: b.name, line: b.line });
        continue;
      }
      if (b.skipped) {
        skippedHits.push({ id, file: b.file, test: b.name, line: b.line });
        continue;
      }
      if (!b.hasAssertion) {
        hollow.push({ id, file: b.file, test: b.name, line: b.line });
        continue;
      }
      const list = byId.get(id) || [];
      list.push({ file: b.file, test: b.name, line: b.line });
      byId.set(id, list);
    }
  }

  const exempt = new Set(exemptIds.map((x) => String(x).toUpperCase()));
  const phrases = parsed.rows.map((row) => {
    const tests = byId.get(row.id) || [];
    const isExempt = exempt.has(row.id);
    return {
      id: row.id,
      digest: row.digest,
      phrase_missing: row.phraseMissing,
      phrase: row.phrase || null,
      tests,
      exempt: isExempt,
      satisfied: tests.length > 0 || isExempt,
    };
  });

  const unbound = phrases.filter((p) => !p.satisfied).map((p) => p.id);
  const unknownExempt = [...exempt].filter((id) => !known.has(id));

  if (parsed.na) {
    return {
      ok: true,
      na: true,
      issues,
      phrases: [],
      unbound: [],
      phantom: [],
      hollow: [],
      skipped: [],
      exempt: [],
      binding_hash: null,
      files_scanned: files.map((f) => f.rel),
    };
  }

  for (const id of unbound) {
    issues.push(`фраза ${id} без теста: нет теста с объявлением «${id}» в PRODUCES задания`);
  }
  for (const p of phantom) {
    issues.push(`${p.file}:${p.line} тест «${p.test}» ссылается на ${p.id} — такой фразы нет в ACCEPTANCE задания`);
  }
  for (const h of hollow) {
    issues.push(`${h.file}:${h.line} тест «${h.test}» объявил ${h.id}, но утверждения в нём нет — пустая связь`);
  }
  for (const s of skippedHits) {
    issues.push(`${s.file}:${s.line} тест «${s.test}» объявил ${s.id}, но пропущен (skip/todo) — это не приёмка`);
  }
  for (const id of unknownExempt) {
    issues.push(`acceptance_ops содержит ${id}, которого нет в ACCEPTANCE задания`);
  }
  if (files.length === 0 && phrases.length > 0) {
    issues.push('в PRODUCES задания нет тестовых файлов: связь «фраза → тест» нечем подтвердить');
  }

  const canonical = phrases
    .map((p) => ({
      id: p.id,
      digest: p.digest,
      exempt: p.exempt,
      tests: p.tests.map((t) => `${t.file}::${t.test}`).sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));

  return {
    ok: issues.length === 0,
    na: false,
    issues,
    phrases,
    bound_ids: phrases.filter((p) => p.satisfied && !p.exempt).map((p) => p.id),
    unbound,
    phantom,
    hollow,
    skipped: skippedHits,
    exempt: [...exempt],
    // Отпечаток связи: фразы (digest) + какие тесты их закрывают. Правка текста фразы
    // после приёмки меняет хеш → pre_release видит «акт устарел».
    binding_hash: sha256(JSON.stringify(canonical)),
    files_scanned: files.map((f) => f.rel),
    phrase_missing: phrases.filter((p) => p.phrase_missing).map((p) => p.id),
  };
}

/** Строки `OUTPUT/tests/test-plan-<D>.md`: ID → тест. */
export function parseTestPlan(text) {
  const rows = [];
  for (const line of String(text || '').split('\n')) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim().replace(/^`|`$/g, ''));
    const idm = (cells[0] || '').match(/^(A\d+\.\d+)$/i);
    if (!idm) continue;
    const testRef = cells.find((c, i) => i > 0 && /[./]/.test(c) && /\.[A-Za-z0-9]{1,6}(?:::.*)?$/.test(c));
    const status = (cells[cells.length - 1] || '').toLowerCase();
    rows.push({
      id: idm[1].toUpperCase(),
      phrase: cells[1] || '',
      testRef: testRef || null,
      file: testRef ? testRef.split('::')[0] : null,
      status: status || null,
    });
  }
  return rows;
}

/** Сверка test-plan ↔ binding: план не может называть тест, который фразу не объявляет. */
export function checkTestPlan(outRoot, d, binding) {
  const rel = `tests/test-plan-${d}.md`;
  const abs = path.join(outRoot, rel);
  const issues = [];
  if (!fs.existsSync(abs)) return { ok: false, file: rel, rows: [], issues: [`нет ${rel}`] };
  const rows = parseTestPlan(fs.readFileSync(abs, 'utf8'));
  const byId = new Map(binding.phrases.map((p) => [p.id, p]));
  const seen = new Set();

  for (const row of rows) {
    seen.add(row.id);
    const phrase = byId.get(row.id);
    if (!phrase) {
      issues.push(`${rel}: строка ${row.id} — фразы нет в ACCEPTANCE задания`);
      continue;
    }
    if (!row.testRef) {
      issues.push(`${rel}: строка ${row.id} без пути к тесту`);
      continue;
    }
    const named = phrase.tests.some((t) => t.file === row.file);
    if (!named && !phrase.exempt) {
      issues.push(`${rel}: строка ${row.id} ссылается на ${row.testRef}, но этот тест фразу не объявляет`);
    }
    if (/^(blocked|todo|tbd|—|-)$/i.test(row.status || '')) {
      issues.push(`${rel}: строка ${row.id} не закрыта (статус «${row.status}»)`);
    }
  }

  for (const p of binding.phrases) {
    if (!seen.has(p.id) && !p.exempt) issues.push(`${rel}: нет строки для фразы ${p.id}`);
  }

  return { ok: issues.length === 0, file: rel, rows, issues };
}
