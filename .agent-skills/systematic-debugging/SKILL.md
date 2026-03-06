---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
source: https://github.com/obra/superpowers
---

# Systematic Debugging

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## The Four Phases

You MUST complete each phase before proceeding to the next.

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read Error Messages Carefully** — Don't skip past errors. Read stack traces completely.
2. **Reproduce Consistently** — Can you trigger it reliably? If not reproducible → gather more data, don't guess.
3. **Check Recent Changes** — What changed? Git diff, recent commits, new dependencies, config changes.
4. **Gather Evidence in Multi-Component Systems** — Add diagnostic instrumentation at each component boundary. Run once to gather evidence showing WHERE it breaks.
5. **Trace Data Flow** — Where does bad value originate? Keep tracing up until you find the source. Fix at source, not at symptom.

### Phase 2: Pattern Analysis

1. **Find Working Examples** — Locate similar working code in same codebase.
2. **Compare Against References** — Read reference implementation COMPLETELY. Don't skim.
3. **Identify Differences** — List every difference, however small.
4. **Understand Dependencies** — What other components, settings, config, environment?

### Phase 3: Hypothesis and Testing

1. **Form Single Hypothesis** — "I think X is the root cause because Y". Write it down.
2. **Test Minimally** — Make the SMALLEST possible change. One variable at a time.
3. **Verify Before Continuing** — Did it work? If not, form NEW hypothesis. DON'T add more fixes on top.

### Phase 4: Implementation

1. **Create Failing Test Case** — MUST have before fixing.
2. **Implement Single Fix** — Address the root cause. ONE change at a time. No "while I'm here" improvements.
3. **Verify Fix** — Test passes? No other tests broken?
4. **If 3+ Fixes Failed: Question Architecture** — Stop and discuss with human partner before attempting more fixes.

## Red Flags - STOP and Follow Process

If you catch yourself thinking:

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "It's probably X, let me fix that"
- "One more fix attempt" (when already tried 2+)

**ALL of these mean: STOP. Return to Phase 1.**

## Quick Reference

| Phase                 | Key Activities                                         | Success Criteria            |
| --------------------- | ------------------------------------------------------ | --------------------------- |
| **1. Root Cause**     | Read errors, reproduce, check changes, gather evidence | Understand WHAT and WHY     |
| **2. Pattern**        | Find working examples, compare                         | Identify differences        |
| **3. Hypothesis**     | Form theory, test minimally                            | Confirmed or new hypothesis |
| **4. Implementation** | Create test, fix, verify                               | Bug resolved, tests pass    |
