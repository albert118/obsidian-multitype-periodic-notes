import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';

export default defineConfig(
  globalIgnores([
    'node_modules',
    'dist',
    '.github',
    'esbuild.config.mts',
    'esbuild.build.mjs',
    'version-bump.mjs',
    'versions.json',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'tests/*.spec.ts',
  ]),
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  ...obsidianmd.configs.recommended,
  {
    files: ['src/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true, // Automatically handles tsconfig.json mapping
        tsconfigRootDir: import.meta.dirname,
        // projectService: {
        //     allowDefaultProject: ['eslint.config.mjs', 'manifest.json', 'vitest.config.ts', 'main.ts'],
        // },
        extraFileExtensions: ['.json'],
      },
    },
    rules: {
      'obsidianmd/rule-custom-message': 'off',
    },
  },
);
