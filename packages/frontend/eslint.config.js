import js from '@eslint/js'
import globals from 'globals'
import parserTs from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
    {
        ignores: [
            'dist/**',
            'coverage/**',
            'playwright-report/**',
            'test-results/**',
            '.eslintrc.cjs',
        ],
    },
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            parser: parserTs,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-undef': 'off', // Typescript handles global and type symbols
            'no-unused-vars': 'off',
            'no-empty': 'off',
            // Bare console.error hides errors from Sentry — use
            // reportError() from '@/lib/sentry' instead (#1278)
            'no-console': ['error', { allow: ['warn'] }],
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'off',
            'react-refresh/only-export-components': [
                'warn',
                { allowConstantExport: true },
            ],
        },
    },
    {
        files: ['tests/e2e/**/*.ts'],
        rules: {
            'react-hooks/rules-of-hooks': 'off',
        },
    },
    {
        // Node build/CLI scripts — console output is their interface
        files: ['scripts/**/*.ts'],
        rules: {
            'no-console': 'off',
        },
    },
    {
        // shadcn/ui components commonly export a cva()-generated variants
        // helper alongside the component (e.g. badgeVariants); the rule's
        // allowConstantExport option doesn't recognize a cva() call as a
        // constant, so these vendored files are exempt.
        files: ['src/components/ui/**/*.tsx'],
        rules: {
            'react-refresh/only-export-components': 'off',
        },
    },
]
