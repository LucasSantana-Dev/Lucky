# ADR 2026-05-21 — Break Cycle C via direct imports + minimal extraction (audioFeatures, vcWeights)

**Status:** Accepted (implementation in this PR)
**Context-Pack:** Session 2026-05-21 — Cycle C drain, issue #889
**Supersedes:** none
**Related:**

- Parent: `2026-05-16-next-refactor-target-bot-circular-deps.md`
- Memory: `project_bot_circular_deps_done_2026-05-16` (Cycles A + B shipped via PR #885-#888 + #925; C left as residual)

## Context

PR #888 + PR #925 reduced `packages/bot/src` runtime cycles from 15 → 4 → 2. Two cycles remained at release/v2.14.0 HEAD:

1. The deferred type-only `types/CustomClient → models/Command → types/CommandData` (acceptable; will resolve when type-only imports are migrated).
2. **Cycle C** — `utils/music/queueManipulation.ts ↔ utils/music/autoplay/replenisher.ts`.

The cycle persisted because:

- `queueManipulation.ts` (97 LOC after PR #925) imports `replenishQueue` from `./autoplay/replenisher` AND re-exports `queueRescue` + `candidateFallback` symbols via `export *`.
- `replenisher.ts` imports 6 symbols from the `queueManipulation` barrel: `collectBroadFallbackCandidates`, `collectGenreCandidates`, `enrichWithAudioFeatures`, `interleaveByArtist` (all live in `candidateFallback.ts`), `buildVcContributionWeights` (lives in `queueRescue.ts`), and `getTrackAudioFeatures` (the one symbol whose body actually lived in `queueManipulation.ts`, along with its module-level `audioFeatureCache: LRUCache`).

A prior agent attempt to break Cycle C broke 107 tests due to "closure-captured state in queueManipulation" and was rolled back. The exact failure mode wasn't preserved; the conservative inference is that the prior approach mutated how the audio cache singleton was accessed.

## Decision

Break Cycle C with the smallest possible surgical change:

1. **Direct-import the 4 already-extracted symbols** in `replenisher.ts`. Replace `from '../queueManipulation'` with direct imports from `'../candidateFallback'`. No code moves; only the import path changes.
2. **Extract `getTrackAudioFeatures` + `audioFeatureCache` + `AudioFeatureEntry` type** to `autoplay/audioFeatures.ts`. The cache stays a module-level `const`, just in a different module — no closure shape change. `queueManipulation.ts` continues to re-export `getTrackAudioFeatures` for backward compat.
3. **Extract `buildVcContributionWeights`** to `autoplay/vcWeights.ts` (pure function, ~25 LOC). `queueRescue.ts` re-exports it. Needed because `queueRescue.ts:3` already had `import { replenishQueue } from './autoplay/replenisher'`, so the direct-import path in step 1 would have just shifted Cycle C to a new `queueRescue ↔ replenisher` 2-cycle. Extracting the leaf function breaks both.

Net: `queueManipulation.ts` becomes barrel-only (no originating symbols apart from re-exports). Madge cycle count drops from 2 → 1 (only the deferred type-only cycle remains). Zero public-API change — every previously-exported symbol is still importable from `queueManipulation` and `queueRescue`.

## Alternatives considered

- **B — Larger extraction (audioFeatures + vcWeights + collapse barrel entirely).** Rejected for now. The barrel is consumed by ~30 files; collapsing it forces a churn-y find-replace across the bot for no architectural gain beyond what Option A already delivers.
- **C — Accept the cycle, document as architectural debt.** Rejected. Cycle C blocks promoting `madge.yml` from `continue-on-error: true` to a hard gate — the main driver of #871. Accepting it means giving up on that gate, which loses the whole prevention mechanism the refactor was meant to enable.
- **D — Hand-roll a callback indirection (replenisher exposes a fn that queueManipulation calls).** Rejected. Real callback patterns exist for behaviour decoupling, not for breaking import-graph cycles. Adding indirection here would obscure call sites for no runtime benefit.

## Consequences

### Positive

- Madge cycle count for `packages/bot/src`: 2 → 1. The 1 remaining cycle is the deferred type-only one (`types/CustomClient`).
- `madge.yml` can now be promoted from `continue-on-error: true` to a blocking gate (separate PR after this lands).
- The "closure-capture" failure mode from the prior agent attempt is avoided: `audioFeatureCache` stays a module-level `const LRUCache` — the move is purely lexical.
- `queueManipulation.ts` is now genuinely barrel-only (no originating logic). Future readers understand its role at a glance.
- Net LOC change ≈ +30 (two new files: `audioFeatures.ts` 73 LOC, `vcWeights.ts` 25 LOC) − removed lines in `queueManipulation.ts` (~60) − inline definition removed from `queueRescue.ts` (~26). Roughly LOC-neutral.

### Negative

- Two new files in `autoplay/` (`audioFeatures.ts`, `vcWeights.ts`). The `autoplay/` folder grows by 2 small modules. Mildly increases directory cognitive load.
- `queueRescue.ts` and `queueManipulation.ts` now have re-export lines that point at `./autoplay/*` — a slight inversion of expected file-system hierarchy (utilities usually live above their consumers, not under them). Acceptable: the `autoplay/` subdir is conceptually a peer surface within the music utils.

### Neutral

- 433/433 autoplay+queue+replenisher tests still pass.
- 3075/3075 total bot tests pass in the worktree (the 2 failing suites in the full run are unrelated `prom-client` resolution issues, env-only).
- No behaviour change. Audio-feature cache semantics, lock semantics, and replenish ordering are byte-identical.

## Implementation plan

1. Branch `refactor/cycle-c-889` off `origin/release/v2.14.0`.
2. Create `autoplay/audioFeatures.ts` (lift `getTrackAudioFeatures` + cache + type verbatim).
3. Create `autoplay/vcWeights.ts` (lift `buildVcContributionWeights` verbatim).
4. Slim `queueManipulation.ts` to barrel-only + `export { getTrackAudioFeatures } from './autoplay/audioFeatures'`.
5. Slim `queueRescue.ts` to `export { buildVcContributionWeights } from './autoplay/vcWeights'`.
6. Update `replenisher.ts`: split the 6-symbol import into direct imports from `candidateFallback`, `vcWeights`, `audioFeatures`.
7. Confirm `npx madge --circular --extensions ts packages/bot/src` reports 1 cycle (the deferred type-only one).
8. Confirm autoplay + queue test suites green.
9. Open PR → release/v2.14.0.

Rollback: revert the commit. No downstream impact — `queueManipulation` and `queueRescue` both keep their public surface via re-export.

## Revisit triggers

- **A new music utility accumulates >50 LOC in `queueManipulation.ts`** — pattern signal that something other than barrel re-exports is creeping back in. Re-evaluate whether `queueManipulation.ts` should still exist as a barrel at all, or whether it should be promoted to a thin orchestrator with explicit imports.
- **`madge.yml` promotion to blocking gate is reverted** — the gate was the point of this refactor; if it's flaking enough to disable, revisit whether Cycle C should have been accepted (Option C) after all.
- **The deferred type-only `CustomClient` cycle resolves** — at that point Lucky's `bot` package can claim "0 runtime cycles" for the first time. Revisit whether `madge.yml` should also enforce `--no-typescript-default` or equivalent stricter modes.
- **Audio-feature cache moves to Redis or shared/services** — `audioFeatures.ts` is the natural seam for that migration. If that work happens, this ADR's extraction is the prep step.

## Related artefacts

- Issue: #889 (Cycle C residual, follow-up to #871)
- PR: refactor/cycle-c-889 → release/v2.14.0
- Parent ADR: `decisions/2026-05-16-next-refactor-target-bot-circular-deps.md`
- Memory: `project_bot_circular_deps_done_2026-05-16` (Cycles A+B status)
