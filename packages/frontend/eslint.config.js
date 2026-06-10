import js from '@eslint/js'
import globals from 'globals'
import parserTs from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'

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
]
