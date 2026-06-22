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
- **CI auto-tag guard alone** — codifies the manual workaround but doesn't fix the root cause; kept as the companion, not the fix.
- **Replace release-please with tag-on-merge** — reverses ADR 2026-06-16; heavy; rejected.

## Consequences

Positive:

- Releases auto-tag → auto-deploy, no manual `git tag` step per release.
- One-line, reversible config change; no workflow or version-bump/changelog regression.

Negative / residual risk:

- `${version}` resolving in the _group_ pattern is verified-by-design (single package, standard interpolation) but **proven only on the next release** — v2.20.1 is the live test. Mitigated by explicitly watching that release (not relying on silent success) + the companion guard.

Neutral:

- The stale #1519 (created with the old title) won't be retitled; it must be closed so release-please regenerates a correctly-titled PR (see plan).

## Plan / validation

1. PR the config change → merge to `main`.
2. **Close #1519** so release-please regenerates the release PR — it should now be titled `chore: release 2.20.1`.
3. Merge the regenerated PR → confirm release-please **auto-creates the v2.20.1 tag + GitHub release** (no manual flip) → `release: published` fires the deploy. This both ships v2.20.1 and **validates the fix**.
4. If step 3 still requires a manual tag → the group-pattern fix didn't take → switch to `separate-pull-requests: true` and build the CI auto-tag guard.

## Revisit when

- **A release PR again merges without an auto-created tag** → the fix regressed; build the CI auto-tag guard and/or switch to `separate-pull-requests: true`.
- **A 2nd package is added to the manifest** → `${version}` becomes ambiguous in the combined group PR; move to per-component titles/tags.
- **release-please major upgrade** changes title-pattern/interpolation semantics → re-verify.
