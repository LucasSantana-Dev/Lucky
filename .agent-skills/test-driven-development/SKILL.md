---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code
source: https://github.com/obra/superpowers
---

# Test-Driven Development (TDD)

## Overview

Write the test first. Watch it fail. Write minimal code to pass.

**Core principle:** If you didn't watch the test fail, you don't know if it tests the right thing.

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write code before the test? Delete it. Start over.

## Red-Green-Refactor

### RED - Write Failing Test

Write one minimal test showing what should happen. Clear name, tests real behavior, one thing.

### Verify RED - Watch It Fail (MANDATORY - Never skip)

```bash
npm test path/to/test.test.ts
```

Confirm: Test fails (not errors). Failure message is expected. Fails because feature missing.

### GREEN - Minimal Code

Write simplest code to pass the test. Don't add features beyond the test.

### Verify GREEN - Watch It Pass (MANDATORY)

```bash
npm test path/to/test.test.ts
```

Confirm: Test passes. Other tests still pass. Output pristine.

### REFACTOR - Clean Up

After green only. Remove duplication. Keep tests green. Don't add behavior.

## Nexus-Specific Context

- Tests live in `packages/backend/tests/unit/services/`
- Uses Jest with ESM: `NODE_OPTIONS=--experimental-vm-modules jest`
- Mock pattern: `jest.unstable_mockModule('@nexus/shared/utils/database/prismaClient', ...)`
- Run tests: `npm run test` from repo root (runs backend tests)

## Red Flags - STOP and Start Over

- Code before test
- Test passes immediately without a failing step
- Tests added "later"
- "I'll test after confirming fix works"

**All of these mean: Delete code. Start over with TDD.**
