# ADR 2026-09-03: Audit gate takes a second npm audit read before passing

**Status:** Accepted
**Deciders:** Lucas Santana
**Ref:** issue #2150, PR #2148, `scripts/audit-gate.mjs`

## Context

`npm audit` intermittently answers with a truncated advisory set. `scripts/audit-gate.mjs` compares that output against an `ACCEPTED` allowlist; a dropped package in a truncated read is indistinguishable from a fixed one. Before this fix, a truncated read that dropped an accepted advisory was read as "no longer reported" (stale), and the gate exited 1 before it ever printed the real blocking findings. That reddened unrelated PRs roughly one run in three, naming a different package each time depending on what that run's truncation happened to drop.

## Decision

`evaluate()` (the function that judges one `npm audit` JSON response against `ACCEPTED`) is pure, so the gate can run it twice and compare:

- The gate always takes a first read. If that read already has blocking findings, the run fails on those. A second read could only add more findings, never fewer, so there is nothing to gain by re-reading.
- If the first read has zero blocking findings (the run is about to pass), that pass is not trusted on one read alone. A truncated read produces a false PASS the same way it produces a false "stale," by silently dropping a package. The gate takes a second read in that case.
- `blocking` becomes the second read's blocking set (the first read had none, so this is the union of the two).
- `stale` is the intersection: an acceptance is only reported stale when both reads agree it is no longer present. One truncated read dropping a real acceptance is not enough to call it dead.
- When the two reads disagree (second read blocks, or the stale set shrinks), the gate prints a note that npm audit disagreed with itself across two reads and that it is trusting the read that reported more, so the discrepancy is visible instead of silently resolved.

## Known limit

If both reads happen to truncate the same package, the gate still misfires the same way the single-read version did. The fallback policy for that case is to demote `stale` from a fatal condition to a warning, not to add a third read. Two truncated reads landing on the same package is an npm audit reliability problem, and adding reads narrows the window without closing it.

## Alternatives considered

- **Pin npm version.** Rejected: npm 10 and npm 11 were checked against the same dependency tree and agree; the truncation is not a version-specific regression, so pinning would not fix it.
- **Drop the stale check entirely.** Rejected: the stale check is what catches an acceptance in `ACCEPTED` that has outlived its advisory (the package was patched, and the allowlist entry is now dead weight that should be removed). Dropping it removes a real signal, not just the false positives.

## Consequences

**Positive:** a truncated read no longer fails the gate on a phantom "advisory no longer reported"; the real blocking findings, when there are any, are what actually surfaces.
**Negative:** a run that is genuinely clean now costs two `npm audit` invocations instead of one.
**Neutral:** a run that already has blocking findings on the first read is unaffected, with no extra cost and the same outcome.

## Revisit when

- Two reads land on the same truncation twice in a short window. Apply the known-limit fallback (demote `stale` to a warning) instead of adding a third read.
- npm ships a documented fix for the truncation itself, at which point the second read becomes unnecessary cost rather than a safeguard.
