/**
 * ESLint config for local development.
 * Matches ObsidianReviewBot's rules for src/ files.
 *
 * Note: The bot also checks SDL and import rules using its own config.
 * Only obsidianmd + typescript-eslint are needed here.
 */
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['src/**/*.ts'],
    plugins: {
      'obsidianmd': obsidianmd,
    },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.app.json',
        ecmaVersion: 2022,
        sourceType: 'module'
      },
    },
    rules: {
      // TypeScript handles undefined variables better than no-undef
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-self-compare': 'warn',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'prefer-const': 'off',
      'no-implicit-globals': 'error',
      'no-alert': 'error',
      'no-console': 'off',
      'no-restricted-globals': [
        'error',
        { name: 'app', message: 'Avoid using the global app object. Use the reference from your plugin instance.' },
      ],

      // TypeScript rules
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-deprecated': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { args: 'none' }],
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-explicit-any': ['error', { fixToUnknown: true }],

      // All 25 obsidianmd rules
      ...obsidianmd.configs.recommended,
    }
  },
  {
    ignores: ['dist/**', 'node_modules/**', '*.js', '*.mjs']
  }
];
