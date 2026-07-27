# Dependabot reactivated as the dependency bot while Renovate is dark

- **Status:** Accepted (supersedes `2026-05-27-ci-merge-queue-and-renovate.md` and the "Revert to Dependabot is rejected" clause of `2026-06-17-renovate-reactivation.md`)
- **Date:** 2026-07-27
- **Tags:** ci, dependencies, dependabot, renovate

## Context

`2026-05-27` replaced Dependabot with Renovate; `2026-06-17` documented Renovate's first outage and reactivation, rejecting a Dependabot revert. Since then Renovate went dark a **second** time (health-guard issue #1835, open since 2026-07-14; no bot PR activity since 2026-03-06). The 2026-06-17 ADR's prescribed fallback for a second lapse is the self-hosted Renovate Action, but that adds runner cost and operational ownership for a function GitHub provides natively. Meanwhile the repo had no dependency automation at all for weeks.

## Decision

Reactivate Dependabot (`.github/dependabot.yml`) with:

- Grouped minor/patch PRs per ecosystem (npm, docker, github-actions); majors stay standalone.
- **YouTube-adjacent packages excluded from the npm group** (`youtubei.js`, `discord-player-youtubei`, `yt-dlp`, `youtube-dl-exec`, `play-dl`) so they arrive as standalone, title-matched PRs. `ci.yml`'s `test-youtube-smoke` guard matches on PR title; a grouped title would bypass it.
- A second docker entry for `/deploy` so `deploy/Dockerfile` is covered (the `/` entry only scans root-level Dockerfiles).

Remove the Renovate surface in the same change: `.renovaterc.json` and `renovate-health.yml` (its weekly failure noise while #1835 sat open was the trigger for the exit-0 behavior added in the CI efficiency refactor; with the bot retired the monitor is moot). Issue #1835 is closed with a pointer here.

## Alternatives considered

- **Self-hosted Renovate Action** (the 2026-06-17 ADR's fallback) — rejected: runner cost + operational ownership for parity with a native GitHub feature; the original reasons to prefer Renovate (`rebaseStalePrs`, Docker manager coverage) are largely matched by the auto-update-pr-branches workflow plus the `/deploy` entry.
- **Keep both configs and let whichever bot is alive win** — rejected: duplicate/conflicting PRs for the same updates the moment the Renovate App is reinstalled, and doubled CI runs.
- **No dependency bot** — rejected: silent dependency rot is how the YouTube integrations break in production.

## Consequences

- **Positive:** dependency automation resumes; YouTube smoke guard keeps working by construction; one bot, one config, no duplicate-PR risk; weekly red noise from renovate-health ends.
- **Negative:** Dependabot does not auto-rebase stale PRs, so its PRs rot behind main under `strict_required_status_checks_policy`. Mitigated by `auto-update-pr-branches.yml`, which updates auto-merge-enabled PRs on push to main and hourly. Docker coverage for `packages/frontend/Dockerfile.dev` remains absent (Dependabot scans one directory per entry; dev-only file, accepted).
- **Neutral:** `prConcurrentLimit` semantics differ (Dependabot's `open-pull-requests-limit: 5` is per ecosystem, so the real ceiling is 15 concurrent PRs).

## Revisit when

- The Renovate App is reinstalled org-wide and proves stable for a month: evaluate switching back (single PR restoring `.renovaterc.json` + `renovate-health.yml` and deleting `dependabot.yml`).
- Dependabot grouped PRs cause a bad merge the smoke guard would have caught: split the npm group further or drop grouping.
- The stale-PR rebase toil returns despite auto-update-pr-branches: reconsider self-hosted Renovate.
