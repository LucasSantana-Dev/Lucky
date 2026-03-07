---
name: vercel-react-best-practices
description: Apply when writing, reviewing, or refactoring React components in packages/frontend. 58 performance rules across 8 categories.
source: https://github.com/vercel-labs/agent-skills
---

# Vercel React Best Practices

Comprehensive performance optimization guide for React applications, maintained by Vercel. Contains 58 rules across 8 categories, prioritized by impact.

## When to Apply

Reference these guidelines when:

- Writing new React components or pages in `packages/frontend/`
- Reviewing code for performance issues
- Refactoring existing React code
- Optimizing bundle size or load times

## Rule Categories by Priority

| Priority | Category                  | Impact      | Prefix       |
| -------- | ------------------------- | ----------- | ------------ |
| 1        | Eliminating Waterfalls    | CRITICAL    | `async-`     |
| 2        | Bundle Size Optimization  | CRITICAL    | `bundle-`    |
| 3        | Server-Side Performance   | HIGH        | `server-`    |
| 4        | Client-Side Data Fetching | MEDIUM-HIGH | `client-`    |
| 5        | Re-render Optimization    | MEDIUM      | `rerender-`  |
| 6        | Rendering Performance     | MEDIUM      | `rendering-` |
| 7        | JavaScript Performance    | LOW-MEDIUM  | `js-`        |
| 8        | Advanced Patterns         | LOW         | `advanced-`  |

## Key Rules for Nexus Frontend (React + Vite SPA)

**CRITICAL:**

- `async-parallel` — Use Promise.all() for independent data fetches
- `bundle-barrel-imports` — Import directly, avoid barrel files
- `bundle-dynamic-imports` — Use React.lazy() for heavy components (already in use via `App.tsx` lazy loading)
- `bundle-defer-third-party` — Load analytics after hydration

**MEDIUM:**

- `rerender-memo` — Extract expensive work into memoized components
- `rerender-dependencies` — Use primitive dependencies in effects
- `rerender-lazy-state-init` — Pass function to useState for expensive initial values
- `rendering-conditional-render` — Use ternary, not && for conditionals with objects

## Nexus Frontend Location

- Components: `packages/frontend/src/components/`
- Pages: `packages/frontend/src/pages/`
- Hooks: `packages/frontend/src/hooks/`
- Services: `packages/frontend/src/services/`
- Stack: React 19, TypeScript, Tailwind CSS, Framer Motion, Vite
