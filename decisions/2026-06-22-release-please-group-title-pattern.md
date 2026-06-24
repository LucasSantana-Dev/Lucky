# Fix release-please combined-PR title so releases auto-tag

- Date: 2026-06-22
- Status: accepted
- Deciders: Lucas Santana
- Extends: `decisions/2026-06-16-release-cadence-automate-releases.md` (release-please adoption)
- Supersedes the fix attempt in PR #1514

## Context

release-please opens a combined release PR titled `chore: release main` (no version). On the next run (after that PR merges) release-please scans merged release PRs, **cannot parse a version from the title, and aborts** ("untagged, merged release PRs outstanding") — so it never creates the git tag / GitHub release. Because the prod deploy is gated on `release: published`, a missed tag means **no deploy**.

This has recurred for **v2.18.0, v2.19.0, v2.20.0, and v2.20.1 (#1519)** — four releases, each requiring a manual workaround (flip `autorelease: pending`→`tagged`, `git tag` + push, `gh release create`). Per the team's recurrence rule (same root cause ≥2× → mandatory ADR + prevention), this is captured here.

**Root cause (release-please [issue #2712](https://github.com/googleapis/release-please/issues/2712), verified):** in manifest mode with `separate-pull-requests: false`, the **combined** PR title is governed by `group-pull-request-title-pattern`, **not** `pull-request-title-pattern`. The default group pattern is `chore: release ${branch}` → "chore: release main", with no `${version}`. PR #1514 set `pull-request-title-pattern: "chore: release ${version}"` — but that key is only read for _separate_ (per-component) PRs, so the combined-PR path never used it. Proof: #1519 was created **after** PR #1514 landed and is still titled `chore: release main`.

Verified facts:

- Config: `release-type: node`, single package at `.`, `separate-pull-requests: false`, `include-component-in-tag: false`. Manifest `.` → 2.20.0.
- release-please `googleapis/release-please-action@v4.4.1`, config-file `release-please-config.json`.
- No downstream automation matches the release-PR title string (the only `pull_request.title` matching in CI is the YouTube-dependency smoke trigger) — changing the title is safe.

Reviewed by `decision-critic` (verdict: ACCEPT). Its reconciliation items are addressed below.

## Decision

Add **`"group-pull-request-title-pattern": "chore: release ${version}"`** to `release-please-config.json` — the key release-please actually uses for the combined manifest PR. With a single package, `${version}` resolves to that package's next version, so the PR title becomes `chore: release 2.20.1`; the post-merge scan parses the version and release-please tags + releases automatically, eliminating the manual workaround.

`pull-request-title-pattern` is kept (harmless; only used if the config ever moves to separate PRs).

**Companion guard (per critic — ship as fast-follow):** add a CI step that, when a `release-please` PR merges without producing a tag, surfaces it loudly (or auto-creates the tag). Four prior _silent_ failures mean a regression should not be able to fail quietly again. This is gated by the first revisit trigger below — built immediately if v2.20.1 doesn't auto-tag, and recommended regardless within the release cycle.

## Validation outcome (2026-06-22) — title fix was NECESSARY BUT NOT SUFFICIENT

The group-pattern fix worked **for the title**: after it merged, release-please regenerated the release PR (#1522) titled `chore: release 2.20.1` (version present, no longer `chore: release main`). Confirmed.

But on merging #1522, release-please **still aborted** with the same `⚠ There are untagged, merged release PRs outstanding - aborting` and did **not** create the v2.20.1 tag. With `skip-github-release: false` and the PAT, its release-creation step still failed to associate the squash-merged release PR and tag it — the accumulated manual-tag history + squash-merge association is a deeper release-please reliability problem than the title alone.

**Conclusion:** release-please's auto-tag cannot be relied on in this repo. The title fix is kept (it is a precondition and harmless), but the **durable fix is the CI auto-tag guard** (`.github/workflows/release-tag-guard.yml`), shipped now rather than deferred — exactly the critic's "ship alongside" recommendation, promoted from companion to primary mechanism. The guard fires on a manifest-version bump (release PR merge) and creates `v<version>` + the Release via the PAT if release-please didn't, so a release can never silently fail to ship again. v2.20.1 itself was tagged via the one-last-time manual workaround.

## Alternatives considered

- **`separate-pull-requests: true`** — switches to per-package PRs, which _do_ read `pull-request-title-pattern` (already set), so `${version}` resolves. Rejected as primary: a larger behavioral change (PR structure + reviewer workflow) than needed for a one-package repo. It is the fallback if the group-pattern fix doesn't resolve `${version}`.
- **CI auto-tag guard** — initially considered the companion to the title fix. After the validation outcome below, it was **promoted to the primary durable mechanism** (shipped in `.github/workflows/release-tag-guard.yml`), because the title fix alone did not make release-please tag reliably.
- **`separate-pull-requests: true`** — still available as a further fallback if even the title generation regresses; not needed, since the guard makes tagging deterministic regardless.
- **Replace release-please with tag-on-merge** — reverses ADR 2026-06-16; heavy; rejected. (The guard is effectively a narrow tag-on-merge backstop _layered on_ release-please, keeping its version-bump + changelog value.)

## Consequences

Positive:

- Releases tag + release deterministically: release-please does version-bump + changelog + PR; the **guard guarantees the `v<version>` tag + GitHub Release** (and thus the deploy) on merge. No manual `git tag` per release.
- The title fix is a one-line, reversible config change with no version-bump/changelog regression; the guard is idempotent (keys on the Release) and a no-op when release-please does tag.

Negative / residual risk:

- Two mechanisms can now create the release (release-please + guard). The guard's Release-existence check makes this safe (no double-release), but a future release-please that _does_ tag will make the guard a silent no-op — fine, but worth knowing when debugging.

**Follow-up (2026-06-24, #1561):** the guard created the Release but did **not** flip the merged release PR's `autorelease: pending → tagged` label, so release-please still saw an "untagged, merged release PR outstanding" and aborted the _next_ release. This recurred at **v2.24.0 → v2.25.0**, again forcing a manual relabel. Fixed by adding a **label-reconcile step** to `release-tag-guard.yml` — a _separate_ step (not gated by the create-step's early-exit), idempotent, that flips `autorelease: pending → tagged` on the merged release PR for the current version. The guard now reconciles **both** the Release _and_ the label state release-please tracks, so the next release can never silently block. The original "Negative / residual risk" above (release-please's label tracking) is thereby closed.

Neutral:

- The stale #1519 (old title) was closed so release-please regenerated a correctly-titled PR (#1522).

## Plan / validation — DONE

1. ✅ PR the config change (#1521) → merged.
2. ✅ Closed #1519 → release-please regenerated #1522 titled **`chore: release 2.20.1`** (title fix confirmed).
3. ❌ Merged #1522 → release-please **still aborted**, no v2.20.1 tag → title fix necessary but not sufficient (see Validation outcome above).
4. ✅ Shipped v2.20.1 via the manual workaround one last time; built + shipped the **CI auto-tag guard** (#1523) as the durable fix.

## Revisit when

- **The guard ever creates a release that release-please should have** (check Actions warnings) — expected for now; if release-please starts tagging reliably again (e.g. after an upgrade), the guard becomes a redundant no-op and could be removed.
- **A release merges with neither release-please nor the guard tagging it** → the guard regressed; debug the workflow (PAT scope, paths filter, manifest key).
- **A 2nd package is added to the manifest** → `${version}` becomes ambiguous in the combined group PR _and_ the guard's single-version assumption breaks; move to per-component titles/tags.
- **release-please major upgrade** changes title-pattern/interpolation or release-creation semantics → re-verify and reconsider whether the guard is still needed.
