// Jest config used ONLY by Stryker mutation runs (#1464).
//
// Stryker re-runs every test that *covers* a surviving mutant. The default
// jest config (jest.config.cjs) includes the integration (supertest) suite,
// and shared middleware/utils like validate.ts are transitively covered by
// every route spec — so each mutant re-ran ~50 integration tests, pushing a
// full run to ~10 minutes. Mutation testing wants fast, focused unit tests:
// this config restricts the runner to tests/unit/** so each mutant re-runs
// only the unit tests that exercise it.
const base = require('./jest.config.cjs')

module.exports = {
    ...base,
    testMatch: [
        '<rootDir>/tests/unit/**/*.test.ts',
        '<rootDir>/tests/unit/**/*.spec.ts',
    ],
    testPathIgnorePatterns: [
        ...base.testPathIgnorePatterns,
        '<rootDir>/tests/integration/',
    ],
    // Coverage is irrelevant under Stryker (it computes mutation score, not
    // line coverage) and the threshold would fail on the unit-only subset.
    collectCoverage: false,
    coverageThreshold: undefined,
}
