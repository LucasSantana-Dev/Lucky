/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
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
    '!src/generated/**',
    // Barrel files: pure re-exports, no logic
    '!src/index.ts',
    '!src/services/index.ts',
    '!src/utils/index.ts',
    '!src/types/index.ts',
    '!src/types/errors/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  // Honest gate (#1277): set just below coverage measured on 2026-06-09
  // (47.08/41.83/38.82/46.76). The previous 89/89/90/89 was never enforced —
  // no CI job ran shared tests — and had drifted far from reality. Ratchet
  // these up as coverage improves; never raise above measured coverage.
  coverageThreshold: {
    global: {
      statements: 46,
      branches: 41,
      functions: 38,
      lines: 46
    }
  },
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^discord$': 'discord.js',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      isolatedModules: true,
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      },
      extensionsToTreatAsEsm: ['.ts']
    }],
    '^.+\\.js$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        module: 'esnext'
      }
    }]
  },
  transformIgnorePatterns: [],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],
  verbose: true,
  clearMocks: true,
  restoreMocks: true
}
