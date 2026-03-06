---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing, before committing or creating PRs
source: https://github.com/obra/superpowers
---

# Verification Before Completion

## Overview

Claiming work is complete without verification is dishonesty, not efficiency.

**Core principle:** Evidence before claims, always.

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

## The Gate Function

BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
5. ONLY THEN: Make the claim

## LukBot Verification Commands

```bash
npm run lint          # ESLint across all packages
npm run type:check    # TypeScript across all packages
npm run build         # Build shared → bot → backend → frontend
npm run test          # Jest tests (packages/backend)
```

Full verify sequence: `npm run lint && npm run type:check && npm run build && npm run test`

## Common Failures

| Claim          | Requires                      | Not Sufficient |
| -------------- | ----------------------------- | -------------- |
| Tests pass     | Test output: 0 failures       | Previous run   |
| Build succeeds | Build: exit 0                 | Linter passing |
| Bug fixed      | Test original symptom: passes | Code changed   |

## Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Done!", "Fixed!", etc.)
- About to commit without verification
- Relying on partial verification
