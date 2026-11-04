/**
 * Минимальный eslint-plugin-local-rules для проектов из Witness Done.
 * Правила-заглушки с лёгкими AST-проверками; усиливай под проект.
 *
 * Имя пакета для ESLint: положи папку как `eslint-plugin-local-rules`
 * в корень проекта (рядом с .eslintrc.js) ИЛИ подключи через
 * settings / resolvePluginsRelativeTo.
 */
'use strict';

function isZodParseCall(node) {
  // *.parse( JSON.parse(...) ) or z.*.parse(JSON.parse(...))
  return (
    node.type === 'CallExpression' &&
    node.callee &&
    node.callee.type === 'MemberExpression' &&
    node.callee.property &&
    node.callee.property.name === 'parse'
  );
}

const rules = {
  'no-json-parse-without-zod': {
    meta: { type: 'suggestion', docs: { description: 'JSON.parse should be validated (Zod)' } },
    create(context) {
      return {
        CallExpression(node) {
          const cal = node.callee;
          if (
            cal &&
            cal.type === 'MemberExpression' &&
            cal.object.name === 'JSON' &&
            cal.property.name === 'parse'
          ) {
            const parent = node.parent;
            if (parent && isZodParseCall(parent)) return;
            if (
              parent &&
              parent.type === 'CallExpression' &&
              parent.callee &&
              parent.callee.type === 'MemberExpression' &&
              ['parse', 'safeParse'].includes(parent.callee.property.name)
            ) {
              return;
            }
            context.report({
              node,
              message: 'Оберни JSON.parse в Zod parse/safeParse',
            });
          }
        },
      };
    },
  },

  'no-storage-without-trycatch': {
    meta: { type: 'problem', docs: { description: 'localStorage/sessionStorage in try/catch' } },
    create(context) {
      function inTry(node) {
        let p = node.parent;
        while (p) {
          if (p.type === 'TryStatement') return true;
          p = p.parent;
        }
        return false;
      }
      return {
        MemberExpression(node) {
          if (
            node.object &&
            (node.object.name === 'localStorage' || node.object.name === 'sessionStorage')
          ) {
            if (!inTry(node)) {
              context.report({ node, message: 'Доступ к Storage только внутри try/catch' });
            }
          }
        },
      };
    },
  },

  'no-direct-fetch': {
    meta: { type: 'suggestion', docs: { description: 'Prefer shared HTTP client' } },
    create(context) {
      return {
        CallExpression(node) {
          if (node.callee && node.callee.type === 'Identifier' && node.callee.name === 'fetch') {
            context.report({
              node,
              message: 'Не используй голый fetch — общий API-клиент + Zod на ответе',
            });
          }
        },
      };
    },
  },

  'no-empty-catch': {
    meta: { type: 'problem' },
    create(context) {
      return {
        CatchClause(node) {
          if (!node.body || node.body.body.length === 0) {
            context.report({ node, message: 'Пустой catch запрещён' });
          }
        },
      };
    },
  },

  'no-floating-promises': {
    meta: { type: 'problem' },
    create() {
      return {};
    },
  },

  'no-swallowed-errors': {
    meta: { type: 'suggestion' },
    create(context) {
      return {
        CatchClause(node) {
          const body = node.body && node.body.body;
          if (!body || body.length === 0) return;
          const only = body.length === 1 && body[0].type === 'EmptyStatement';
          if (only) context.report({ node, message: 'Ошибка проглатывается' });
        },
      };
    },
  },

  'no-unclean-timeout': {
    meta: { type: 'problem' },
    create(context) {
      return {
        CallExpression(node) {
          if (
            node.callee &&
            node.callee.type === 'Identifier' &&
            (node.callee.name === 'setTimeout' || node.callee.name === 'setInterval')
          ) {
            // эвристика: предупреждение; полная проверка cleanup — вручную/в тестах
            context.report({
              node,
              message: 'Проверь cleanup таймера в useEffect return',
            });
          }
        },
      };
    },
  },

  'no-missing-deps': {
    meta: { type: 'problem' },
    create() {
      return {};
    },
  },

  'no-state-mutation': {
    meta: { type: 'problem' },
    create(context) {
      return {
        AssignmentExpression(node) {
          if (
            node.left.type === 'MemberExpression' &&
            node.left.object.type === 'Identifier' &&
            /state|prev|current/i.test(node.left.object.name)
          ) {
            context.report({
              node,
              message: 'Похоже на мутацию state — используй immutable update',
            });
          }
        },
      };
    },
  },

  'no-any-as-return': {
    meta: { type: 'problem' },
    create(context) {
      return {
        TSTypeAnnotation(node) {
          if (node.typeAnnotation && node.typeAnnotation.type === 'TSAnyKeyword') {
            context.report({ node, message: 'any запрещён — unknown + сужение' });
          }
        },
      };
    },
  },

  'no-type-assertion-without-check': {
    meta: { type: 'suggestion' },
    create(context) {
      return {
        TSAsExpression(node) {
          if (node.typeAnnotation && node.typeAnnotation.type === 'TSAnyKeyword') {
            context.report({ node, message: 'as any запрещён' });
          }
        },
      };
    },
  },

  'no-array-map-without-key': {
    meta: { type: 'problem' },
    create() {
      return {};
    },
  },

  'no-inline-function-in-jsx': {
    meta: { type: 'suggestion' },
    create() {
      return {};
    },
  },

  'no-inner-html': {
    meta: { type: 'suggestion' },
    create(context) {
      return {
        JSXAttribute(node) {
          if (node.name && node.name.name === 'dangerouslySetInnerHTML') {
            context.report({
              node,
              message: 'dangerouslySetInnerHTML — только с обоснованием и санитизацией',
            });
          }
        },
      };
    },
  },

  'no-eval': {
    meta: { type: 'problem' },
    create(context) {
      return {
        CallExpression(node) {
          if (node.callee.type === 'Identifier' && node.callee.name === 'eval') {
            context.report({ node, message: 'eval запрещён' });
          }
          if (
            node.callee.type === 'MemberExpression' &&
            node.callee.object.name === 'Function'
          ) {
            context.report({ node, message: 'new Function запрещён' });
          }
        },
        NewExpression(node) {
          if (node.callee.name === 'Function') {
            context.report({ node, message: 'new Function запрещён' });
          }
        },
      };
    },
  },

  'no-console-production': {
    meta: { type: 'suggestion' },
    create(context) {
      return {
        MemberExpression(node) {
          if (
            node.object.name === 'console' &&
            node.property.name === 'log'
          ) {
            context.report({ node, message: 'console.log не для production-путей' });
          }
        },
      };
    },
  },

  'no-magic-numbers': {
    meta: { type: 'suggestion' },
    create() {
      return {};
    },
  },
};

module.exports = { rules };
