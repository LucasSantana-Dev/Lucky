/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/tests'],
    testMatch: ['**/*.test.ts', '**/*.spec.ts'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/*.test.ts',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov'],
    // Floor pinned to the round-down of the post-#821 baseline
    // (stmts 67 / branches 63 / functions 63 / lines 68). Binding without
    // forcing emergency work; tighten 2-3 % per cleanup phase as the suite
    // shrinks. See .agents/plans/test-cleanup-phase2.md.
    coverageThreshold: {
        global: {
            statements: 65,
            branches: 60,
            functions: 60,
            lines: 65,
        },
    },
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^chalk$': '<rootDir>/tests/__mocks__/chalk.ts',
        '^@lucky/shared$': '<rootDir>/../shared/src/index',
        '^@lucky/shared/services$':
            '<rootDir>/../shared/src/services/index',
        '^@lucky/shared/utils$': '<rootDir>/../shared/src/utils/index',
        '^@lucky/shared/config$': '<rootDir>/../shared/src/config/index',
        '^@lucky/shared/types$': '<rootDir>/../shared/src/types/index',
        '^@lucky/shared/utils/database/prismaClient$':
            '<rootDir>/tests/__mocks__/prismaClient.ts',
        '^@lucky/shared/(.*)$': '<rootDir>/../shared/src/$1',
    },
    transform: {
        '^.+\\.ts$': [
            'ts-jest',
            {
                diagnostics: false,
                tsconfig: {
                    esModuleInterop: true,
                    allowSyntheticDefaultImports: true,
                    module: 'CommonJS',
                    target: 'ES2017',
                    moduleResolution: 'node',
                },
            },
        ],
    },
    transformIgnorePatterns: ['node_modules/(?!(?:@lucky)/)'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    verbose: true,
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,
    testTimeout: 15000,
}
