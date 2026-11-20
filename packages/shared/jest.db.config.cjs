// Postgres-backed suites (*.db.spec.ts): raw SQL that mocks cannot exercise.
// Run with `npm run test:db --workspace=packages/shared` against a migrated,
// disposable local database. Excluded from the default `jest` run (#2534).
const { coverageThreshold: _coverageThreshold, ...base } = require('./jest.config.cjs')

const [, tsOptions] = base.transform['^.+\\.ts$']

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  testMatch: ['**/*.db.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/'],
  moduleNameMapper: {
    ...base.moduleNameMapper,
    // The generated client `import()`s the query compiler as .mjs, which
    // ts-jest turns into a `require`. Prisma ships a CommonJS build beside it.
    '^(@prisma/client/runtime/.+)\\.mjs$': '$1.js',
  },
  transform: {
    ...base.transform,
    '^.+\\.ts$': ['<rootDir>/jest.db.transformer.cjs', tsOptions],
  },
  collectCoverage: false,
  // One database, shared tables: keep files sequential.
  maxWorkers: 1,
}
