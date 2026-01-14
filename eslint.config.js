import globals from "globals"
import pluginJs from "@eslint/js"
import pluginTs from "@typescript-eslint/eslint-plugin"
import parserTs from "@typescript-eslint/parser"
import eslintConfigPrettier from "eslint-config-prettier"

export default [
    {
        ignores: [
            "dist/**/*",
            "**/dist/**/*",
            "node_modules/**/*",
            "*.config.js",
            "*.config.ts",
            "**/*.d.ts",
            "tests/**/*",
            "**/*.test.ts",
            "**/*.spec.ts",
            "src/generated/**/*",
        ],
    },
    {
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.es2022,
            },
        },
    },
    pluginJs.configs.recommended,
    eslintConfigPrettier,
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parser: parserTs,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
                project: "./tsconfig.json",
            },
        },
        plugins: {
            "@typescript-eslint": pluginTs,
        },
        rules: {
            // TypeScript specific rules
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                },
            ],
            "no-unused-vars": "off",

            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-non-null-assertion": "error",
            "@typescript-eslint/no-unsafe-assignment": "error",
            "@typescript-eslint/no-unsafe-call": "error",
            "@typescript-eslint/no-unsafe-member-access": "error",
            "@typescript-eslint/no-unsafe-return": "error",

            "prefer-const": "error",
            "no-var": "error",
            "no-duplicate-imports": "error",
            "no-useless-return": "error",
            "no-eval": "error",
            "no-implied-eval": "error",
            "no-new-func": "error",
            "no-alert": "error",
            "no-debugger": "error",
            "no-console": "warn",
            "complexity": ["warn", 15],
            "max-depth": ["warn", 6],
            "max-params": ["warn", 6],
        },
    },
    {
        files: ["**/*.js"],
        rules: {
            "no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],
        },
    },
    {
        files: ["src/webapp/public/**/*.js"],
        languageOptions: {
            globals: {
                ...globals.browser,
            },
        },
    },
]
