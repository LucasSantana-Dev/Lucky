## Description

<!-- Briefly describe what this PR does and why. -->

## Checklist

- [ ] Tests pass locally
- [ ] CHANGELOG.md updated (if user-facing)
- [ ] TypeScript builds cleanly

## Destructive / irreversible interaction (Tier A)

**Skip this section if this PR adds no irreversible Discord action** (message delete/move, ban, kick, bulkDelete/purge, timeout, channel/role removal). See `decisions/2026-06-21-destructive-interaction-merge-gate.md`.

- [ ] Live smoke performed — happy path **and** guard paths (missing perms, target gone, dest==source, partial delete where the repost succeeds but the original delete fails) on a real guild
- [ ] Evidence attached below (screenshot or short description)

<!-- If the Destructive Interaction Gate flagged this PR but it is genuinely non-destructive, add the `non-destructive-confirmed` label with a one-line justification instead of ticking the box above. -->

## Feature-removal sweep

**Skip this section if this PR doesn't remove a route, handler, endpoint, model, or toggle.**

When removing a feature, ensure no orphan code is left behind:

- [ ] Orphan Prisma models removed (or depended-upon by other models)
- [ ] Broken or stale test files removed
- [ ] Unused type aliases removed
- [ ] Imports/exports cleaned up
- [ ] ADRs and CONTEXT.md cross-references updated
