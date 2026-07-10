# Frontend Bundle Analysis

## Overview

This document tracks the baseline bundle sizes for the Lucky frontend application. Bundle size monitoring is critical to prevent performance regressions.

## Current Baseline (v2.17.0)

### Main Chunks (Gzip)

| Chunk | Raw Size | Gzip Size | Limit | Notes |
|-------|----------|-----------|-------|-------|
| index | 226.48 KB | 71.56 KB | 75 KB | Main app bundle |
| vendor-ui | 211.15 KB | 67.00 KB | 70 KB | UI framework + utilities |
| vendor-react | 178.41 KB | 56.39 KB | 60 KB | React + React Router |
| vendor-radix | 152.15 KB | 40.40 KB | 43 KB | Radix UI components |
| vendor-forms | 94.61 KB | 26.16 KB | 28 KB | Form handling (React Hook Form + Zod) |
| vendor-state | 67.48 KB | 24.48 KB | 26 KB | State management (Zustand, TanStack Query, Axios) |

### Total

- **Raw Total**: ~930 KB
- **Gzip Total**: ~285 KB

## Tools

### Local Inspection

**rollup-plugin-visualizer** generates an interactive HTML report of bundle composition:

```bash
npm run build --workspace=packages/frontend
# Output: packages/frontend/dist/bundle-analysis.html
```

Open this file in a browser to explore the bundle visually.

### CI Monitoring

Two tools work together to track bundle size:

1. **compressed-size-action** (GitHub Actions)
   - Posts PR comments showing size deltas
   - Runs on every PR that touches frontend code
   - Workflow: `.github/workflows/bundle-size.yml`

2. **size-limit** (CI enforcement)
   - Fails the build if any chunk exceeds configured limits
   - Configuration: `.size-limit.json`
   - Configured limits allow ~5% growth margin for legitimate feature additions

## Accepted Growth Limits

The current limits in `.size-limit.json` allow approximately 5% growth on each chunk. This provides a buffer for:
- New legitimate feature additions
- Dependency updates
- Code split optimizations

**Chunks exceeding the limits will fail CI.**

## When Bundle Size Increases

If your PR exceeds bundle size limits:

1. Review the `compressed-size-action` PR comment for size delta details
2. Check the `size-limit` CI log for which chunks exceeded limits
3. Consider:
   - Is this a necessary feature? Validate with the bundle visualization.
   - Can you optimize existing code?
   - Should the limit be adjusted? (rare — requires team discussion)
   - Can code be lazy-loaded or code-split differently?

## Optimization Strategies

### 1. Code Splitting
Already in place via Vite's `manualChunks` in `vite.config.ts`:
- `vendor-react`: React + routing
- `vendor-radix`: UI primitives
- `vendor-forms`: Form libraries
- `vendor-state`: State management
- `vendor-ui`: Other UI utilities

### 2. Dynamic Imports
Use `React.lazy()` for large feature modules loaded on-demand.

### 3. Bundle Visualization
Run `npm run build` and open `dist/bundle-analysis.html` to identify large/duplicate modules.

### 4. Dependency Review
Before adding a new dependency, consider:
- Size impact (use `npm ls <package>` or bundlephobia.com)
- Whether alternatives are smaller
- If lazy-loading is viable

## Baseline Updates

When baseline sizes legitimately increase (e.g., major feature launch), update:
1. This document with new baseline values
2. `.size-limit.json` with new limits (discuss with team first)
3. Include justification in the PR/commit

---

Last updated: 2026-07-09 (v2.17.0)
