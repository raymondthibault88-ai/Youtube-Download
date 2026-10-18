import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['dist/**', 'release/**', 'node_modules/**', 'test-results/**', 'playwright-report/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['src/**/*.{ts,tsx}']
  })),
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: globals.browser
    },
  },
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    ...reactHooks.configs.flat.recommended
  },
  {
    files: ['electron/**/*.cjs', 'scripts/**/*.cjs', 'tests/**/*.cjs', 'playwright.config.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: globals.node
    }
  },
  {
    files: ['tests/ui/**/*.cjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  }
];
