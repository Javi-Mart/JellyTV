import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', '.lab/**', 'node_modules/**', 'android-tv/**'] },
  js.configs.recommended,
  { languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }] } }
];
