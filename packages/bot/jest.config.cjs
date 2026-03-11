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
        '!src/index.ts',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov'],
    moduleNameMapper: {
        '^@lucky/shared$': '<rootDir>/../shared/src/index',
        '^@lucky/shared/services$':
            '<rootDir>/../shared/src/services/index',
        '^@lucky/shared/utils$': '<rootDir>/../shared/src/utils/index',
        '^@lucky/shared/config$': '<rootDir>/../shared/src/config/index',
        '^@lucky/shared/types$': '<rootDir>/../shared/src/types/index',
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
                },
            },
        ],
    },
    transformIgnorePatterns: [
        'node_modules/(?!(chalk|@lucky)/)',
    ],
    moduleFileExtensions: ['ts', 'js', 'json'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    verbose: true,
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,
    testTimeout: 15000,
}
