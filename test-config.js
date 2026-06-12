import parserTs from "@typescript-eslint/parser"
import pluginTs from "@typescript-eslint/eslint-plugin"

export default [
    {
        ignores: ["**/*.spec.ts"]
    },
    {
        files: ["packages/*/src/**/*.ts"],
        languageOptions: {
            parser: parserTs,
        },
        plugins: {
            "@typescript-eslint": pluginTs,
        },
        rules: {
            "no-empty": ["warn", { allowEmptyCatch: false }]
        }
    }
]
