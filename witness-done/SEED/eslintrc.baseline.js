/**
 * Baseline ESLint config for Witness Done (SEED).
 * Источник: корневой .eslintrc.js репозитория-носителя фабрики.
 *
 * На PIPELINE/08 агент:
 * 1) копирует этот файл в КОРЕНЬ проекта как `.eslintrc.js`
 * 2) адаптирует ignorePatterns/overrides под структуру из architecture
 * 3) ставит resolvePluginsRelativeTo / локальный плагин local-rules
 *
 * НЕ используй как есть без адаптации путей проекта.
 */
module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'local-rules'],
  // Плагин лежит в eslint-plugin-local-rules/ у корня проекта (копируется с SEED)
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/consistent-type-imports': [
      'error',
      { prefer: 'type-imports' },
    ],

    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'no-unused-expressions': 'off',
    '@typescript-eslint/no-unused-expressions': 'error',
    'no-constant-condition': 'error',

    'local-rules/no-json-parse-without-zod': 'warn',
    'local-rules/no-storage-without-trycatch': 'error',
    'local-rules/no-direct-fetch': 'warn',

    'local-rules/no-empty-catch': 'error',
    'local-rules/no-floating-promises': 'off',
    'local-rules/no-swallowed-errors': 'warn',

    'local-rules/no-unclean-timeout': 'error',
    'local-rules/no-missing-deps': 'off',
    'local-rules/no-state-mutation': 'error',

    'local-rules/no-any-as-return': 'error',
    'local-rules/no-type-assertion-without-check': 'warn',

    'local-rules/no-array-map-without-key': 'error',
    'local-rules/no-inline-function-in-jsx': 'off',

    'local-rules/no-inner-html': 'warn',
    'local-rules/no-eval': 'error',

    'local-rules/no-console-production': 'warn',
    'local-rules/no-magic-numbers': 'warn',
  },
  ignorePatterns: [
    'dist',
    'build',
    'node_modules',
    '**/dist',
    '**/node_modules',
    'coverage',
    'witness-done',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.ts',
    '**/*.spec.tsx',
    '**/*.test.*.ts',
    '**/*.test.*.tsx',
    'vite.config.ts',
    'vitest.config.ts',
  ],
  overrides: [
    {
      files: [
        '**/scripts/**',
        '**/e2e/**',
        '**/*Draft.ts',
        '**/*Draft.tsx',
        '**/*Harness*.ts',
        '**/*Harness*.tsx',
        '**/*harness*.ts',
        '**/*harness*.tsx',
      ],
      rules: {
        'local-rules/no-magic-numbers': 'off',
        'local-rules/no-type-assertion-without-check': 'off',
        'local-rules/no-inline-function-in-jsx': 'off',
        'local-rules/no-missing-deps': 'off',
        'local-rules/no-json-parse-without-zod': 'off',
      },
    },
    {
      files: ['**/scripts/**'],
      rules: {
        'local-rules/no-json-parse-without-zod': 'off',
        'local-rules/no-console-production': 'off',
        'no-console': 'off',
      },
    },
  ],
};
