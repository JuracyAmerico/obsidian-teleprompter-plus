/**
 * ESLint config matching ObsidianReviewBot's exact configuration.
 * Source: https://github.com/obsidianmd/eslint-plugin/blob/main/lib/index.ts
 *
 * The bot uses:
 * - tseslint.configs.recommendedTypeChecked (type-aware TS rules)
 * - @microsoft/eslint-plugin-sdl (innerHTML, document.write)
 * - eslint-plugin-import (no-nodejs-modules, no-extraneous-dependencies)
 * - eslint-plugin-depend (ban-dependencies)
 * - All 25 obsidianmd rules
 * - no-restricted-globals for app, fetch, localStorage
 */
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import sdl from '@microsoft/eslint-plugin-sdl';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    extends: tseslint.configs.recommendedTypeChecked,
    languageOptions: {
      parserOptions: {
        project: './tsconfig.app.json',
        ecmaVersion: 2022,
        sourceType: 'module'
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        NodeJS: 'readonly',
        // Obsidian globals
        DomElementInfo: 'readonly',
        SvgElementInfo: 'readonly',
        activeDocument: 'readonly',
        activeWindow: 'readonly',
        createDiv: 'readonly',
        createEl: 'readonly',
        createFragment: 'readonly',
        createSpan: 'readonly',
        createSvg: 'readonly',
        sleep: 'readonly',
      }
    },
    plugins: {
      'obsidianmd': obsidianmd,
      '@microsoft/sdl': sdl,
      'import': importPlugin,
    },
    rules: {
      // === Bot's general rules ===
      'no-unused-vars': 'off',
      'no-self-compare': 'warn',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'prefer-const': 'off',
      'no-implicit-globals': 'error',
      'no-alert': 'error',
      'no-undef': 'error',
      'no-console': 'off', // overridden by obsidianmd/rule-custom-message below
      'no-restricted-globals': [
        'error',
        { name: 'app', message: 'Avoid using the global app object. Use the reference from your plugin instance.' },
        // fetch is 'warn' level in the bot config
      ],

      // === Bot's TypeScript rules ===
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-deprecated': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { args: 'none' }],
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-explicit-any': ['error', { fixToUnknown: true }],
      // These come from recommendedTypeChecked:
      // @typescript-eslint/no-unnecessary-type-assertion — error
      // @typescript-eslint/no-redundant-type-constituents — error
      // @typescript-eslint/no-floating-promises — error
      // @typescript-eslint/no-unsafe-* — error

      // === Microsoft SDL ===
      '@microsoft/sdl/no-document-write': 'error',
      '@microsoft/sdl/no-inner-html': 'error',

      // === Import plugin ===
      'import/no-nodejs-modules': 'off', // isDesktopOnly: true
      'import/no-extraneous-dependencies': 'error',

      // === ALL 25 obsidianmd rules ===
      'obsidianmd/commands/no-command-in-command-id': 'error',
      'obsidianmd/commands/no-command-in-command-name': 'error',
      'obsidianmd/commands/no-default-hotkeys': 'error',
      'obsidianmd/commands/no-plugin-id-in-command-id': 'error',
      'obsidianmd/commands/no-plugin-name-in-command-name': 'error',
      'obsidianmd/settings-tab/no-manual-html-headings': 'error',
      'obsidianmd/settings-tab/no-problematic-settings-headings': 'error',
      'obsidianmd/vault/iterate': 'error',
      'obsidianmd/detach-leaves': 'error',
      'obsidianmd/hardcoded-config-path': 'error',
      'obsidianmd/no-forbidden-elements': 'error',
      'obsidianmd/no-plugin-as-component': 'error',
      'obsidianmd/no-sample-code': 'error',
      'obsidianmd/no-tfile-tfolder-cast': 'error',
      'obsidianmd/no-view-references-in-plugin': 'error',
      'obsidianmd/no-static-styles-assignment': 'error',
      'obsidianmd/object-assign': 'error',
      'obsidianmd/platform': 'error',
      'obsidianmd/prefer-file-manager-trash-file': 'warn',
      'obsidianmd/prefer-abstract-input-suggest': 'error',
      'obsidianmd/regex-lookbehind': 'error',
      'obsidianmd/sample-names': 'error',
      'obsidianmd/validate-manifest': 'error',
      'obsidianmd/validate-license': 'error',
      'obsidianmd/ui/sentence-case': ['error', { enforceCamelCaseLower: true }],
    }
  },
  {
    ignores: ['dist/**', 'node_modules/**', '*.js', '*.mjs']
  }
);
