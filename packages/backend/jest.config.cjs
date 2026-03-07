/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/tests/**/*.test.ts',
    '**/*.test.ts',
    '**/*.spec.ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/index.ts',
    '!src/server.ts',
    '!src/middleware/index.ts',
    '!src/routes/index.ts',
    '!src/routes/music/**',
    '!src/routes/lastfm.ts'
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
  resolver: '<rootDir>/jest-resolver.cjs',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000,
  maxWorkers: '50%',
  moduleNameMapper: {
    '^@nexus/shared$': '<rootDir>/../shared/src/index',
    '^@nexus/shared/services$': '<rootDir>/../shared/src/services/index',
    '^@nexus/shared/utils$': '<rootDir>/../shared/src/utils/index',
    '^@nexus/shared/config$': '<rootDir>/../shared/src/config/index',
    '^@nexus/shared/types$': '<rootDir>/../shared/src/types/index',
    '^@nexus/shared/(.*)$': '<rootDir>/../shared/src/$1'
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      diagnostics: false,
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(chalk|#ansi-styles|uuid|@nexus)/)',
    '<rootDir>/../shared/dist/'
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
