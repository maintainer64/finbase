import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import solid from 'eslint-plugin-solid/configs/typescript';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/', 'build/', 'node_modules/', '**/*.js', '**/*.mjs', '**/*.cjs', 'finbase/'],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    ...solid,
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        ...globals.es2021,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-explicit-any': 'off',
      'solid/no-destructure': 'off',
    },
  },
);
