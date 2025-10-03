import globals from "globals"
import pluginJs from "@eslint/js"
import pluginTs from "@typescript-eslint/eslint-plugin"
import parserTs from "@typescript-eslint/parser"
import eslintConfigPrettier from "eslint-config-prettier"

export default [
    {
        ignores: [
            "dist/**/*",
            "node_modules/**/*",
            "*.config.js",
            "*.config.ts",
            "**/*.d.ts",
            "tests/**/*",
            "**/*.test.ts",
            "**/*.spec.ts",
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
            "no-unused-vars": "off", // Turn off base rule as it can conflict with @typescript-eslint/no-unused-vars
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/prefer-nullish-coalescing": "error",
            "@typescript-eslint/prefer-optional-chain": "error",
            "@typescript-eslint/no-unnecessary-type-assertion": "error",
            "@typescript-eslint/no-non-null-assertion": "error",
            "@typescript-eslint/consistent-type-imports": "error",
            "@typescript-eslint/consistent-type-exports": "error",
            "no-redeclare": "off", // Allow const + type with same name

            // General code quality rules
            "prefer-const": "error",
            "no-var": "error",
            "no-console": "warn",
            "no-debugger": "error",
            "no-alert": "error",
            "no-eval": "error",
            "no-implied-eval": "error",
            "no-new-func": "error",
            "no-script-url": "error",
            "no-undef": "off", // TypeScript handles this
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
]
