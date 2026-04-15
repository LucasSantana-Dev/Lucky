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
        '^@lucky/shared/utils/general/errorSanitizer(\\.js)?$': '<rootDir>/../shared/src/utils/general/errorSanitizer',
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
    transformIgnorePatterns: ['node_modules/(?!(?:@lucky|uuid)/)'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    verbose: true,
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,
    testTimeout: 15000,
}
