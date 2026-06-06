# ADR 2026-06-06 — Decommission backend GuildAutomationExecutionService

**Status:** Accepted
**Via:** `/research-and-decide` (critic adjudicated delete-vs-retain; landed on delete — no flip)
**Relates to:** [2026-05-19-guild-automation-module-executors](2026-05-19-guild-automation-module-executors.md) (the migration this file is being superseded by)

## Context

The overengineering audit (2026-06-06) flagged `packages/backend/src/services/GuildAutomationExecutionService.ts`
(1,333 LOC) as the single largest removable file in the repo. Investigation made the call
non-trivial, so it went through research-and-decide.

Verified current state:

- **Zero production callers.** The only reference anywhere is its own unit test. The backend
  route `routes/guildAutomation.ts` (`/automation/plan`, `/automation/apply`, `/capture`) now
  imports the **shared** `guildAutomationService` → `GuildAutomationOrchestrator`, not this file.
  The bot already deleted its equivalent.
- **The migration that supersedes it is incomplete.** The shared package wires **3 of 7** module
  executors (autoMessages, moderation, reactionRoles). The other 4 — Roles, Channels, Onboarding,
  CommandAccess — have no shared executor yet.
- This old file holds the **only** full implementations of those 4 modules' apply/remap logic
  (`applyRolesAndChannels`, `applyOnboardingModule`, `pruneStaleRoles/Channels`,
  `remapRolesSection`, `remapOnboardingSection`, `remapCommandAccessSection`, …). It also
  instantiates the 3 new shared executors — i.e. it was the migration's bridge/staging ground,
  now stranded with no caller.
- Its unit test still runs in CI, producing **green coverage for code nothing calls**.
- Solo maintainer; git history is intact and the file is recoverable via `git show <sha>:<path>`.

## Decision

**Delete the file now** (do not retain until the migration completes), specifically:

1. Delete `packages/backend/src/services/GuildAutomationExecutionService.ts` and its test
   `packages/backend/tests/unit/services/GuildAutomationExecutionService.test.ts` in one PR
   (per the repo's "remove the feature, sweep its tests in the same PR" convention).
2. Record the decommission here and cross-link from the migration ADR. The 4 un-migrated
   modules' reference logic lives immutably in git; future executor PRs recover it via
   `git show 71805799:packages/backend/src/services/GuildAutomationExecutionService.ts`
   rather than from stranded live code.

Rationale: the file is **already** dead (no callers), so deletion is runtime-safe — it changes
nothing at execution time. Remaining executors are ported **fresh per module**, not copy-pasted
from this file, so it is a _reference at best_, and git serves that better than drift-prone live
code. "Retain until migration completes" is a weak contract that historically becomes "retain
forever" on this repo (cf. the per-guild-toggle orphan that sat dead for 2 weeks —
[2026-05-19-retire-per-guild-feature-toggles](2026-05-19-retire-per-guild-feature-toggles.md)),
and the passing test is a false coverage signal that invites future devs to treat dead code as
load-bearing.

## Alternatives considered

- **Retain untouched until the migration reaches 7/7, then delete** — rejected. No runtime
  benefit (already uncalled); high risk of becoming permanent if the migration stalls; the
  stranded file drifts from the orchestrator and misleads. Git already preserves the reference.
- **Retain but quarantine** (rename `*.DEPRECATED.ts`, add `@deprecated` header, exclude its
  test from CI) — rejected as a worse version of delete: keeps 1,333 LOC of inert code and the
  confusion surface for a benefit (reference) that git already provides. Acceptable fallback
  only if the revisit-trigger below fires.
- **Extract the 4 un-migrated modules' logic into a holding module now** — rejected as
  premature; that work belongs in each module's executor PR, not a speculative pre-extraction.

## Consequences

- **Positive:** −1,333 LOC (+ its ~2,174-LOC test); removes a false coverage signal; removes a
  drift/confusion source; signals "this path is obsolete, read the migration ADR + executor PRs."
- **Negative:** Porting the remaining 4 executors references git history instead of live code —
  one extra `git show` per module (<5 min). Mitigated by recording the pre-deletion SHA here.
- **Neutral / out of scope:** Whether the 4 un-migrated modules currently apply at all through
  the new orchestrator is a **separate possible functional gap** — this file's deletion neither
  causes nor worsens it (the file has no callers). Tracked as a follow-up, not part of this PR.

## Revisit when

Re-open (and prefer the quarantine fallback) if **any** of:

1. **No module-executor PR merges by 2026-06-20** → the migration has stalled; a live reference
   may regain value over git archaeology.
2. A Roles/Channels/Onboarding/CommandAccess executor PR copies **2+ functions verbatim** from
   the old file → it was a template, not just a reference; reconsider keeping it until 7/7.
3. The separate "do the 4 modules apply through the orchestrator at all?" follow-up reveals the
   old service was the _de facto_ live apply path for them after all (contradicting the
   zero-caller finding) → halt deletion, re-investigate.
