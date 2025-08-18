/* eslint-env node */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
  },
  extends: ['standard-with-typescript', 'plugin:playwright/recommended'],
  parserOptions: {
    project: './tsconfig.json',
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    // It's a good practice to turn off rules that Prettier handles.
    // However, standard-with-typescript should do this.
    // I will add rules here as I find issues.
    'no-unused-vars': 'warn',
    '@typescript-eslint/no-unused-vars': 'warn',
    '@typescript-eslint/no-floating-promises': 'off', // Often noisy in tests
    '@typescript-eslint/strict-boolean-expressions': 'off', // Can be too strict for game logic
    '@typescript-eslint/no-misused-promises': 'off',
    '@typescript-eslint/promise-function-async': 'off',
    'multiline-ternary': 'off',
    'n/no-missing-import': 'off', // This can be problematic with virtual modules or complex paths
  },
  ignorePatterns: [
    '.wrangler/',
    'node_modules/',
    'dist/',
    'build/',
    'test-artifacts/',
    'lighthouse/',
    '*.d.ts',
  ],
};
