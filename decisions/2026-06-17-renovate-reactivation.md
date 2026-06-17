# ADR: Reactivate Renovate (App) + add a dark-period health guard

**Date:** 2026-06-17
**Status:** Accepted
**Issue:** #1481 · **Builds on:** [2026-05-27-ci-merge-queue-and-renovate.md](2026-05-27-ci-merge-queue-and-renovate.md)

## Context

Dependency + security-update automation has been **dark since 2026-05-27**. The
#1069 migration (ADR 2026-05-27) chose **Strict Status Checks + Renovate** and
deleted `.github/dependabot.yml`, but listed two manual post-merge steps:

1. Enable Merge Queue — **moot** (GitHub Merge Queue is Team/Enterprise-gated; this
   repo is on Free; the `merge_group` CI triggers are forward-compatible no-ops).
2. **Install the Renovate App + merge its onboarding PR — never done.**

Consequence: zero `renovate[bot]` PRs since the migration, no Dependency Dashboard
issue ever created, and Dependabot also silent (its config was deleted). A CVE
(#1281) had to be patched **by hand** during the gap. `.renovaterc.json` is committed,
complete, and **validates** (`renovate-config-validator` → "Config validated
successfully"). Renovate ran on this repo earlier (PRs #81–#109, Feb–Mar 2026) and
the sibling `homelab` repo runs this exact App-based config successfully, so the App
is installable and the pattern is proven.

The root cause of the outage was therefore **not** a config or tooling problem — it
was a one-time forgotten manual step whose failure was **invisible and
un-versioned** (nothing in the repo surfaced that automation had stopped).

## Decision

**Reactivate dependency automation via the Renovate GitHub App** (complete the one
unfinished step of #1069) — no config change required — **and add a version-controlled
health guard** so a future silent lapse self-surfaces.

- **Operator step:** install the Renovate App for `LucasSantana-Dev/Lucky` at
  <https://github.com/apps/renovate>, then review/merge the onboarding PR.
- **Code step (this ADR's PR):** `.github/workflows/renovate-health.yml` — a weekly
  scheduled job (Tuesday, after Renovate's Monday run) that asserts a Dependency
  Dashboard issue exists _or_ a `renovate[bot]` PR was updated in the last 21 days,
  and idempotently files a `needs-triage` tracking issue (and fails) if neither holds.

This was reviewed by `decision-critic` (verdict **ACCEPT-WITH-REVISIONS**): the App
path is the simplest correct restore, but its sole high-risk vector is the same
silent-lapse failure that just occurred. The critic's load-bearing revision — make
the revisit trigger **preventive, not reactive** — is adopted as the health guard.

## Alternatives considered

- **Self-hosted Renovate via GitHub Actions** (`renovatebot/github-action` on cron) —
  the strongest alternative: needs no App install (removes the exact failure mode) and
  is fully version-controlled. **Rejected as the primary** because it adds a PAT/token
  secret + workflow maintenance and has **no in-org prior art** (homelab uses the App),
  while the health guard recovers most of its observability benefit at lower cost.
  **Retained as the documented fallback** if the App lapses again despite the guard.
- **Revert to Dependabot** — reverses the recent (2026-05-27) ADR and loses
  `rebaseStalePrs`, reintroducing the stale-cache Docker CI failures #1069 eliminated.
- **Dependabot security-updates only + manual majors** — loses routine patch/minor
  automation; partial.
- **Kodiak / GitHub Merge Queue / status-quo-manual** — all rejected in the
  2026-05-27 ADR (rebase-window doesn't kill root cause / plan-gated / unscalable toil).

## Consequences

**Positive**

- Restores automated patch/minor auto-merge + manual majors + `vulnerabilityAlerts`
  (parity with prior Dependabot surfaces: npm, github-actions, docker, dockerfile).
- The health guard makes any future lapse self-announcing in the issue tracker —
  converting the previous _reactive, human-vigilance_ trigger into an _automated_ one.
- No architectural change, no ADR reversal; honors the proven org pattern.

**Negative / friction**

- Onboarding PR burst: ~47 outdated root deps — **3 major** (manual; 2 are
  YouTube-adjacent → already manual-gated) + **44 minor/patch** (auto-merge, throttled
  to 4/hr · 8 concurrent → ~11h drain). Bounded, not a flood.
- The App install remains an out-of-repo state the guard _detects_ but cannot _prevent_.

**Neutral**

- The health-guard issue may briefly overlap with #1481 until the App is installed
  and the first healthy run auto-closes it.

## Revisit when

- The health guard fires (automation dark >21d) **a second time** → the App is too
  fragile for this repo; switch to the self-hosted Renovate Action fallback.
- Onboarding PR-burst proves chronically disruptive despite the 4/hr·8-concurrent
  throttle → tighten `prConcurrentLimit` / add grouping rules.
- Repo moves to GitHub Team plan → revisit Merge Queue per the 2026-05-27 ADR.
