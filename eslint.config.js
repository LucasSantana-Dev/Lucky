import globals from "globals"
import pluginJs from "@eslint/js"
import pluginTs from "@typescript-eslint/eslint-plugin"
import parserTs from "@typescript-eslint/parser"
import pluginImport from "eslint-plugin-import-x"
import eslintConfigPrettier from "eslint-config-prettier"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))

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
            "no-empty": ["warn", { allowEmptyCatch: false }],
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
    {
        // Ratchet for packages/bot and packages/shared: downgrade to warn
        // until type-safety family, complexity, and import issues are resolved (#1357)
        // basePath pins glob resolution to the repo root regardless of eslint cwd
        basePath: __dirname,
        files: ["packages/{bot,shared}/src/**/*.ts"],
        languageOptions: {
            parser: parserTs,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
                project: [
                    join(__dirname, "packages/bot/tsconfig.json"),
                    join(__dirname, "packages/shared/tsconfig.json"),
                ],
            },
        },
        plugins: {
            "@typescript-eslint": pluginTs,
            "import-x": pluginImport,
        },
        rules: {
            // Core-rule handling at repo-root lint: the cwd-relative TS block
            // (files: ["src/**/*.ts"]) doesn't match from the root, so without
            // these the @eslint/js recommended core rules fire as errors (#1364)
            "no-unused-vars": "off",
            "no-empty": ["warn", { allowEmptyCatch: false }],
            "@typescript-eslint/no-non-null-assertion": "warn",
            // NOTE: the no-unsafe-* inventory is cleaned to 0 (#1378), but these
            // stay at `warn` until the CI `quality / Lint` job is type-aware.
            // That job runs `eslint .` without `db:generate` / `build:shared`,
            // so these type-aware rules report ~4200 phantom "type could not be
            // resolved" errors there; promoting to `error` turns the job
            // permanently red. Promotion is gated on #1386.
            "@typescript-eslint/no-unsafe-assignment": "warn",
            "@typescript-eslint/no-unsafe-call": "warn",
            "@typescript-eslint/no-unsafe-member-access": "warn",
            "@typescript-eslint/no-unsafe-return": "warn",
            "@typescript-eslint/no-unsafe-argument": "warn",
            "@typescript-eslint/no-explicit-any": "warn",
            // Honor the same ^_ ignore convention as the per-package block
            // (line ~52): without these options the root-cwd lint flags
            // intentionally-unused _-prefixed params/vars/caught-errors that
            // the per-package lint already excuses (#1378).
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                },
            ],
            // Superseded by import-x/no-duplicates (autofixable + type-aware).
            // eslint-plugin-import-x is the eslint-10-compatible fork; the
            // original eslint-plugin-import peer-caps at eslint 9 (#1378).
            // Promoted to error: the inventory is cleaned, so this is now a
            // regression guard rather than a ratchet warning.
            "no-duplicate-imports": "off",
            "import-x/no-duplicates": "error",
            "no-useless-assignment": "warn",
            "no-control-regex": "warn",
            "preserve-caught-error": "warn",
            "no-undef": "warn",
            "no-useless-escape": "warn",
            "no-useless-catch": "warn",
            "no-case-declarations": "warn",
        },
    },
]
