// Jest config used ONLY by Stryker mutation runs for the bot package.
// Stryker re-runs every test that covers a surviving mutant. This config
// restricts the runner to .spec.ts files to ensure focused, fast unit tests
// for each mutant.
const base = require('./jest.config.cjs')

module.exports = {
    ...base,
    testMatch: [
        '<rootDir>/src/**/*.spec.ts',
    ],
    // Coverage is irrelevant under Stryker (it computes mutation score, not
    // line coverage) and the threshold would fail on the mutation-only subset.
    collectCoverage: false,
    coverageThreshold: undefined,
}
