/** @type {import('jest').Config} */
export default {
    preset: "ts-jest/presets/default-esm",
    extensionsToTreatAsEsm: [".ts"],
    testEnvironment: "node",
    roots: ["<rootDir>/src", "<rootDir>/tests"],
    testMatch: [
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/tests/**/*.test.ts",
        "**/tests/**/*.spec.ts",
    ],
    collectCoverageFrom: [
        "src/**/*.ts",
        "!src/**/*.d.ts",
        "!src/**/*.test.ts",
        "!src/**/*.spec.ts",
        "!src/types/**/*.ts",
        "!src/**/index.ts",
    ],
    coverageDirectory: "coverage",
    coverageReporters: ["text", "lcov", "html"],
    coverageThreshold: {
        global: {
            branches: 85,
            functions: 85,
            lines: 85,
            statements: 85,
        },
    },
    setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
    testTimeout: 10000,
    verbose: true,
    transform: {
        "^.+\\.ts$": [
            "ts-jest",
            {
                useESM: true,
                tsconfig: {
                    module: "ESNext",
                    target: "ES2022",
                    moduleResolution: "node",
                },
            },
        ],
    },
    moduleFileExtensions: ["ts", "js", "json"],
    testPathIgnorePatterns: [
        "/node_modules/",
        "/dist/",
        "/coverage/",
        "/downloads/",
        "/logs/",
    ],
    transformIgnorePatterns: [
        "node_modules/(?!(chalk|ansi-styles|strip-ansi|has-flag|supports-color|uuid|uuid.*|uuid-.*|uuid\/.*|uuid\/dist.*|uuid\/dist-node.*)/)",
    ],
    moduleNameMapper: {
        "^chalk$": "<rootDir>/tests/__mocks__/chalk.js",
        "^uuid$": "<rootDir>/tests/__mocks__/uuid.js",
    },
}
