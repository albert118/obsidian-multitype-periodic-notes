import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
    globalIgnores([
        'node_modules',
        'dist',
        'esbuild.config.mjs',
        'version-bump.mjs',
        'versions.json',
        'main.js',
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'eslint.config.mts',
        '*.spec.ts',
    ]),
    {
        languageOptions: {
            globals: {
                ...globals.browser,
            },
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['eslint.config.mts', 'manifest.json', 'vitest.config.ts', 'tests/*.spec.ts'],
                },
                // @ts-ignore
                tsconfigRootDir: import.meta.dirname,
                extraFileExtensions: ['.json'],
            },
        },
    },
    ...obsidianmd.configs.recommended,
    {
        // Stage 0 stub deliberately emits both a Notice and a console marker for
        // the manual disable/enable check; permit the console log in this file.
        files: ['src/main.ts'],
        rules: {
            'obsidianmd/rule-custom-message': 'off',
        },
    },
);
