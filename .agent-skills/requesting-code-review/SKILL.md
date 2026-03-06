---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements
source: https://github.com/obra/superpowers
---

# Requesting Code Review

Dispatch code-reviewer subagent to catch issues before they cascade.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**

- After completing a major feature
- Before merge to main
- After fixing complex bugs

**Optional but valuable:**

- When stuck (fresh perspective)
- Before refactoring (baseline check)

## How to Request

**1. Get git SHAs:**

```bash
BASE_SHA=$(git rev-parse HEAD~1)
HEAD_SHA=$(git rev-parse HEAD)
```

**2. Dispatch code-reviewer subagent with:**

- What was implemented
- What it should do (requirements/plan)
- BASE_SHA and HEAD_SHA
- Brief description

**3. Act on feedback:**

- Fix Critical issues immediately
- Fix Important issues before proceeding
- Note Minor issues for later
- Push back if reviewer is wrong (with reasoning)

## LukBot-Specific

- Angular-style commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- Check CHANGELOG.md is updated before review
- Run full verify first: `npm run lint && npm run type:check && npm run build && npm run test`
