/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/packages/backend'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/tests/**/*.test.ts',
    '**/*.test.ts',
    '**/*.spec.ts'
  ],
  collectCoverageFrom: [
    'packages/backend/src/**/*.ts',
    '!packages/backend/src/**/*.d.ts',
    '!packages/backend/src/**/*.test.ts',
    '!packages/backend/src/**/*.spec.ts',
    '!packages/backend/src/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  setupFilesAfterEnv: ['<rootDir>/packages/backend/tests/setup.ts'],
  testTimeout: 30000,
  maxWorkers: '50%',
  moduleNameMapper: {
    '^@nexus/shared$': '<rootDir>/packages/shared/src/index.ts',
    '^@nexus/shared/services$': '<rootDir>/packages/shared/src/services/index.ts',
    '^@nexus/shared/utils$': '<rootDir>/packages/shared/src/utils/index.ts',
    '^@nexus/shared/config$': '<rootDir>/packages/shared/src/config/index.ts',
    '^@nexus/shared/types$': '<rootDir>/packages/shared/src/types/index.ts',
    '^@nexus/shared/(.*)$': '<rootDir>/packages/shared/src/$1'
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(chalk|#ansi-styles|uuid|@nexus)/)',
    '<rootDir>/packages/shared/dist/'
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],
  collectCoverage: false,
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
}
