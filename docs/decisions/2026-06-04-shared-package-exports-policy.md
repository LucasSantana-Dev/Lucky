# ADR: Shared Package Exports Policy

**Date:** 2026-06-04  
**Status:** Decided  
**Context:** Custom Command embed validation refactor

## Problem

The `@lucky/shared/errors/ValidationError` class was used as a VALUE import in `CustomCommandService` but not exported from the package's `exports` map in `package.json`. This caused `ERR_PACKAGE_PATH_NOT_EXPORTED` at runtime when the backend built.

The fix required adding both `./errors` and `./errors/*` export entries to match the existing pattern for other submodules.

## Decision

All new top-level modules in `@lucky/shared` (beyond the existing `.`, `./config`, `./services`, `./utils`, `./types`, `./constants`) MUST:

1. Have an `index.ts` barrel file that exports public symbols
2. Be registered in `packages/shared/package.json` `exports` with both:
    - Exact path: `"./module": { "types": "./dist/module/index.d.ts", "default": "./dist/module/index.js" }`
    - Wildcard path: `"./module/*": { "types": "./dist/module/*.d.ts", "default": "./dist/module/*.js" }`

This allows consumers to import both the barrel (`@lucky/shared/errors`) and submodules (`@lucky/shared/errors/ValidationError`).

## Rationale

- **Prevents runtime crashes** during backend builds by registering all module exports upfront
- **Maintains consistency** across the monorepo (same pattern as utils, services, etc.)
- **Supports both import styles:** full-path and barrel imports
- **Future-proofs:** new modules added to shared won't trigger the same issue

## Tradeoffs

- Requires an extra entry in `package.json` for each new module (low cost, one-time per module)
- Breaking change if a module is accidentally removed from exports without deprecation notice

## Implementation

Applied to `./errors` module in PR addressing custom command embed validation.
