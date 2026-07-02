# ADR 2026-06-27 — Clean up ESLint legacy config and restore react-refresh rule

**Status:** Accepted

**Deciders:** Lucas Santana

**Trigger:** config-drift-detect flagged legacy `.eslintrc.cjs` files that ESLint v10 already ignores; `eslint-plugin-react-refresh` rule was accidentally dropped during flat config migration

## Context

During the monorepo restructure (2026-01), ESLint was migrated from the legacy `.eslintrc` format to the flat config format (`eslint.config.js` / `eslint.config.mjs`). ESLint v10 (`^10.4.0`) ignores legacy `.eslintrc.*` files by default when a flat config is present. However, two stale `.eslintrc.cjs` files were left behind:

### Inventory

| File                                       | Location                                      | Status                                                                                |
| ------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/frontend/.eslintrc.cjs`          | packages/frontend/                            | DEAD — ESLint v10 ignores it; `package.json` scripts pass `--config eslint.config.js` |
| `packages/frontend/frontend/.eslintrc.cjs` | Ghost directory `packages/frontend/frontend/` | DEAD — directory has zero other files; never touched since monorepo restructure       |

Both files are byte-identical (`contentHash: 41721dc8`). The `packages/frontend/frontend/` directory is an artifact — presumably a monorepo restructure that left a stale copy. It contains nothing else.

### The react-refresh gap

The two dead `.eslintrc.cjs` files contained:

```js
'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
```

This rule is **not** present in either:

- `eslint.config.js` (root)
- `packages/frontend/eslint.config.js`

Yet `eslint-plugin-react-refresh@^0.5.0` is still a devDependency in `packages/frontend/package.json`. The rule has been **un-enforced by CI and CLI linting since the flat config migration** — it only applies if a developer's editor picks up the stale `.eslintrc.cjs` by accident. The `packages/frontend/eslint.config.js` even has `'.eslintrc.cjs'` in its `ignores` array, explicitly opting out of the legacy file.

**No other rules are missing.** The `@typescript-eslint/no-unused-vars` difference (error in legacy vs `off` in flat config) is intentional — flat config offloads unused-vars to TypeScript's `noUnusedLocals`.

### Risk of deletion

- **Safe** — all 5 lint scripts (root + 4 packages) explicitly use `-c eslint.config.js` or `--config eslint.config.js`.
- **lint-staged** uses `-c eslint.config.js`.
- **CI** runs `npm run lint:fix` with `--config eslint.config.js`.
- **ESLint v10** ignores legacy config by default when flat config is present.
- No `.vscode/settings.json` overrides reference `.eslintrc.cjs`.
- The self-referential ignore `'.eslintrc.cjs'` in `packages/frontend/eslint.config.js` becomes obsolete.

## Decision

**Port the react-refresh rule to flat config, then delete the dead config files and ghost directory.**

### Order of operations

1. **Port `react-refresh/only-export-components` to `packages/frontend/eslint.config.js`** — restores accidentally-dropped lint coverage before removing the legacy file.
2. **Delete `packages/frontend/.eslintrc.cjs`** — dead file, no tooling references it.
3. **Delete `packages/frontend/frontend/` directory** — ghost directory containing only the stale config.
4. **Remove `'.eslintrc.cjs'` from the `ignores` array in `packages/frontend/eslint.config.js`** — ignore target no longer exists.
5. **Update `docs/FRONTEND.md` line 125** — replace `.eslintrc.cjs` reference in the file-tree diagram with `eslint.config.js`.
6. **Verify** — `npm run lint --workspace=packages/frontend` and `npm run lint` (root) pass.

### What does NOT change

- Rule values, plugin versions, and lint severity — only `react-refresh/only-export-components` at `warn` is added.
- `eslint-plugin-react-refresh` dependency stays — it was already in `packages/frontend/package.json`.
- Root `eslint.config.js` is untouched — its rules and ignore patterns are correct.
- All lint CI workflows are untouched.

## Alternatives considered

- **Delete without porting** — rejected: would permanently lose HMR-export validation for React components in the frontend. The rule existed for a reason.
- **Keep the legacy files as "documentation"** — rejected: ESLint v10 ignores them, so they are dead code. Documentation belongs in `docs/`, not in orphaned config files.
- **Port to root eslint.config.js instead of frontend** — rejected: `react-refresh` is UI-specific (only applies to React components). It belongs in the frontend package config.

## Consequences

**Positive:**

- ~2 files deleted, ~1 ghost directory removed.
- HMR export validation restored for CLI and CI linting.
- One fewer maintenance surface for ESLint config drift.

**Negative:** None identified — the port restores the previous behavior that was accidentally lost.

**Neutral:** No rule strictness changes — `warn` preserved, `allowConstantExport: true` preserved.

## Revisit when

- Never — this is a one-time cleanup. If the react-refresh needs to be adjusted (e.g., to `error` level), that's a separate config change.
