/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/tests'],
    testMatch: ['**/*.test.ts', '**/*.spec.ts'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/*.test.ts',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov'],
    // Floor tightened after Phase 4 cleanup (post-Phase-4 baseline: stmts 66.33 /
    // branches 64.04 / functions 62.51 / lines 67.28). Each threshold = actual − 0.5pp.
    // Statements/functions/lines didn't reach the 68/63/63/68 target — actual coverage
    // didn't improve enough after Phase 4 deletions. See issue #964.
    // functions lowered 62 → 61.5 after ReactionRoles executor refactor (#1068):
    // port adapter arrow fns in applyPlan.ts are behind factory mock → uncovered by design.
    coverageThreshold: {
        global: {
            statements: 65.7,
            branches: 62.5,
            functions: 61.5,
            lines: 66.7,
        },
    },
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^chalk$': '<rootDir>/tests/__mocks__/chalk.ts',
        '^@lucky/shared/utils/database/prismaClient$':
            '<rootDir>/tests/__mocks__/prismaClient.ts',
        '^@lucky/shared/services/guildAutomation/service$':
            '<rootDir>/tests/__mocks__/guildAutomationService.ts',
        '^@lucky/shared$': '<rootDir>/../shared/src/index',
        '^@lucky/shared/services$':
            '<rootDir>/../shared/src/services/index',
        '^@lucky/shared/utils$': '<rootDir>/../shared/src/utils/index',
        '^@lucky/shared/config$': '<rootDir>/../shared/src/config/index',
        '^@lucky/shared/types$': '<rootDir>/../shared/src/types/index',
        '^@lucky/shared/services/guildAutomation$':
            '<rootDir>/../shared/src/services/guildAutomation/index',
        '^@lucky/shared/services/guildAutomation/(.*)$':
            '<rootDir>/../shared/src/services/guildAutomation/$1',
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
    restoreMocks: true,
    // Deliberate: Discord integration tests use shorter timeout than backend (30000)
    testTimeout: 15000,
}
