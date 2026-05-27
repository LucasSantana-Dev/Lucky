---
status: accepted
date: 2026-05-25
revisit_after: 2026-06-08
---

# Release cadence: Docker build as required PR check + production deploy wait timer

On 2026-05-24, 20+ PRs merged to `main` in a single day. Docker `build-and-push` failed on every commit because `prepare: "husky"` in package.json called a devDep binary absent in the production `--omit=dev` build (PR #1007 wired husky but package.json still had `"prepare": "husky"` instead of `"husky || true"`). The backend image was broken for ~24 hours before detection via GitHub mobile. The developer's concern: ❌ icons visible on merged commits; no gate blocked the merge; Docker failures were advisory-only.

## Decision

Two changes:

1. **Add `docker-build-check` as a required PR check.** A new job in `ci.yml` builds all four Docker services (bot, backend, frontend, nginx) without pushing on every PR targeting `main`. Catches build-step regressions (missing binaries, broken package.json lifecycle scripts, Dockerfile syntax errors) before merge. Added to branch protection required checks alongside Quality Gates, Security, SonarCloud Scan, and madge.

2. **Add a 30-minute wait timer on the `production` GitHub Actions environment.** The production deploy job in `deploy.yml` references the `production` environment, which has a required wait of 30 minutes before the deployment step runs. This provides passive bake time between code landing on `main` and reaching the homelab, without branch-management overhead. For emergency hotfixes, the wait can be skipped by a manual environment approval.

## Option rejected: `release/*` branch buffer

Reinstating `release/vX.Y.Z` as the PR merge target was evaluated and rejected.

Three blocking issues:

1. **Wrong autosync direction.** `release-branch-autosync.yml` fast-forwards the release branch to track `main`, not the reverse. To create actual bake time (release→main promotion), a new workflow would be needed that doesn't exist, and the existing autosync would conflict.

2. **Ceremony without bake time.** The bake-time benefit requires either manual promotion or new automation. Without it, a developer can still fast-forward release→main immediately — the buffer is only as long as the developer voluntarily waits. No technical enforcement.

3. **Solo-developer branch orphan risk.** Stale `release/*` branches that diverge from `main` silently create ambiguous git history: which branch do you tag the release from? This is a material risk for a single-developer project where no one checks branch hygiene daily.

The historical workflow (PRs targeting `release/*`, confirmed in `feedback_tbd_release_branches.md`) has no tracked evidence of preventing production bugs — it was the prior convention, not a validated safeguard.

## Options rejected: other candidates

- **Merge Queue**: Serializes merges but doesn't add bake time. Overhead without signal.
- **Commit status gate on deploy**: Equivalent to the environment wait timer but less visible and harder to bypass during emergencies.
- **Status quo + tighten only existing gates**: Does not address Docker advisory-only status.

## Consequences

**Positive:**

- Docker build failures are caught before merge, not after. The husky bug class is prevented.
- The 30-minute deploy timer gives passive bake time. A broken build on `main` won't reach production within 30 minutes, giving time to revert if another CI check surfaces an issue late.
- No branch-management overhead — PR workflow is unchanged.

**Negative:**

- `docker-build-check` adds ~5–8 minutes to every PR CI run (4 matrix services, with layer cache).
- If Docker builds fail frequently for unrelated CI environment reasons (native module binary mismatches, Alpine vs. glibc, disk space), the check becomes a recurring blocker. This must be monitored.
- The 30-minute wait timer applies to all deploys including urgent hotfixes. The bypass path (manual environment approval) exists but adds a step.

**Neutral:**

- `release.yml` (triggered by tag push) is unchanged. Tagging a release remains a manual, explicit act.
- `release-branch-autosync.yml` and `release-train-changelog-check.yml` remain wired but idle (no active `release/*` branches). They activate only if a release branch is created manually.

## Revisit when

- **2026-06-08** (2-week trial end): Measure Docker check failure rate during the trial window.
    - If ≤2 unrelated failures/week: keep the check permanently.
    - If >2 unrelated failures/week: remove the check, investigate CI environment stability (native modules, Alpine build toolchain), and revisit adding the check only after the environment is stable.
- The 30-minute wait timer should be reduced to 10 minutes if urgent hotfixes are blocked more than once.
- If Lucky adds integration tests that boot the Docker image and verify it serves traffic: the Docker build check becomes more comprehensive and its value increases significantly.
- If Docker failures recur (despite this change) due to a different root cause: re-evaluate whether `release/*` buffer is worth the overhead.

## Cross-references

- PR #1060: root cause fix (`"prepare": "husky || true"`).
- `docs/decisions/2026-05-23-branch-protection-required-checks.md` — prior branch protection ADR.
- `feedback_tbd_release_branches.md` — historical `release/*` convention, now superseded by this ADR.
