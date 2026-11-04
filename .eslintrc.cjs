/**
 * ESLint для NOVA CRM (frontend + backend отчётности).
 *
 * Источник: SEED/eslintrc.baseline.js, адаптирован под структуру проекта:
 *   src/          — React 18 + Fastify 4, TypeScript strict; домены в src/features/**,
 *                   отчётный backend в src/reporting/**, платформа в src/shared/** и src/server/**
 *
 * Правила проекта, которые нельзя отключать:
 *   - app-код только на TypeScript (`no-restricted-syntax` + расширение файлов);
 *   - `any` запрещён, `@ts-ignore` запрещён;
 *   - `console.log` запрещён (логирование только через pino/логгер);
 *   - `dangerouslySetInnerHTML` и `eval` запрещены (CSP, INV-010);
 *   - fetch только через общий api-клиент (иначе теряются заголовки и обработка 401).
 *
 * Локальный плагин лежит в eslint-plugin-local-rules/ (копия SEED, не правится вручную).
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  settings: { react: { version: '18.3' } },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  plugins: ['@typescript-eslint', 'react-hooks', 'local-rules'],
  rules: {
    // Типы: строгий режим без исключений
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/ban-ts-comment': [
      'error',
      { 'ts-ignore': true, 'ts-nocheck': true, 'ts-expect-error': 'allow-with-description' },
    ],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/no-unnecessary-condition': 'warn',

    // Запреты CSP и безопасности
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'local-rules/no-eval': 'error',
    'local-rules/no-inner-html': 'error',
    'local-rules/no-json-parse-without-zod': 'error',
    'local-rules/no-storage-without-trycatch': 'error',
    'local-rules/no-empty-catch': 'error',
    'local-rules/no-unclean-timeout': 'error',
    'local-rules/no-state-mutation': 'error',
    'local-rules/no-any-as-return': 'error',
    'local-rules/no-array-map-without-key': 'error',

    // Логи и отладка
    'no-console': ['error', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'local-rules/no-console-production': 'error',

    // Общие
    'no-constant-condition': 'error',
    'no-unused-expressions': 'off',
    '@typescript-eslint/no-unused-expressions': 'error',
    eqeqeq: ['error', 'always'],
    'prefer-const': 'error',
  },
  ignorePatterns: [
    'dist',
    'build',
    'node_modules',
    'coverage',
    'playwright-report',
    'test-results',
    'witness-done',
    'eslint-plugin-local-rules',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.ts',
    '**/*.spec.tsx',
    'vite.config.ts',
    'vitest.config.ts',
    '*.config.js',
  ],
  overrides: [
    {
      // App-код — только TypeScript. Файлы .js/.jsx в src/ запрещены.
      files: ['src/**/*.{js,jsx}'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'Program',
            message: 'App-код только на TypeScript (strict). Перенесите файл в .ts/.tsx.',
          },
        ],
      },
    },
    {
      files: ['e2e/**', 'scripts/**', '*.config.ts', '*.config.js'],
      rules: {
        'no-console': 'off',
        'local-rules/no-console-production': 'off',
        'local-rules/no-magic-numbers': 'off',
      },
    },
    {
      files: ['**/*.d.ts'],
      rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
  ],
};
