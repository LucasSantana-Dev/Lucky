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
    '!src/routes/music/**',
    'src/routes/music/playbackRoutes.ts',
    'src/routes/music/stateRoutes.ts',
    'src/routes/music/autoplayRoutes.ts',
    'src/routes/music/index.ts',
    'src/routes/music/queueRoutes.ts',
    'src/routes/music/helpers.ts'
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
  // Limit parallelism for stability with large test suite
  maxWorkers: '50%',
  moduleNameMapper: {
    '^@lucky/shared$': '<rootDir>/../shared/src/index',
    '^@lucky/shared/services$': '<rootDir>/../shared/src/services/index',
    '^@lucky/shared/utils$': '<rootDir>/../shared/src/utils/index',
    '^@lucky/shared/config$': '<rootDir>/../shared/src/config/index',
    '^@lucky/shared/types$': '<rootDir>/../shared/src/types/index',
    '^@lucky/shared/services/guildAutomation$': '<rootDir>/../shared/src/services/guildAutomation/index',
    '^@lucky/shared/services/guildAutomation/(.*)$': '<rootDir>/../shared/src/services/guildAutomation/$1',
    '^@lucky/shared/(.*)$': '<rootDir>/../shared/src/$1',
    'generated/prisma/client': '<rootDir>/tests/__mocks__/prismaClient.ts'
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      diagnostics: false,
      tsconfig: '<rootDir>/tsconfig.test.json'
    }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(chalk|#ansi-styles|uuid|@lucky)/)',
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
  clearMocks: true,
  restoreMocks: true
}
