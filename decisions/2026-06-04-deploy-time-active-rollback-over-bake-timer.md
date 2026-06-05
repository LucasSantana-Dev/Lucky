---
status: accepted
date: 2026-06-04
revisit_after: 2026-07-15
supersedes_partial: 2026-05-25-release-cadence-gates.md (the 30-min wait-timer portion)
---

# Deploy time: replace the 30-min bake timer with active health-gated rollback

## Context

The `Production` GitHub Actions environment has a **30-minute `wait_timer`**
protection rule. Merging to `main` auto-arms the homelab deploy (via the
`workflow_run` trigger on a successful "Build & Push Docker Images"), and that
deploy job then waits 30 minutes before running. The operator's complaint:
**merge→live takes 30+ minutes for every change, and that's too slow.**

The 30 minutes is **not** build or deploy machinery — the actual deploy work
(Docker image wait, webhook, health/SHA/auth-config checks) is fast. It is a
deliberate **passive bake window**, added in
`2026-05-25-release-cadence-gates.md` after the husky bug left `main`'s image
broken for ~24h. The intent: give time to revert before bad code reaches the
homelab.

Two problems with the bake timer as a safety mechanism:

1. **The original bug-class is already caught earlier.** `docker-build-check` is
   now a required PR gate, and the deploy only fires after "Build & Push Docker
   Images" _succeeds_. A broken image no longer reaches the deploy step at all.
2. **Passive bake time only protects if something is watching during the
   window.** Nothing automated acts during the 30 minutes; the husky bug was
   caught at 24h via phone, not by a timer. A silent wait with no active signal
   is mostly just delay.

## Decision

**Replace the passive 30-minute bake timer with an active, health-gated,
self-reverting deploy.** Goal: merge→live in deploy-time (a few minutes) for
_all_ changes, not just hotfixes.

Mechanism (entire pipeline is in-repo and editable: `deploy.yml` →
`deploy/hooks.json` → `scripts/deploy.sh`, with `docker-compose.yml` already
parameterizing `IMAGE_TAG`):

1. **SHA-pinned deploys.** The deploy webhook passes the git SHA; `deploy.sh`
   sets `IMAGE_TAG=<sha>` and runs `docker compose up -d`. Every commit is
   already pushed as a `:sha` image, so any prior version is reachable.
2. **Auto-rollback on health failure.** After recreate, `deploy.sh`
   health-checks (`/api/health` + version-SHA + auth-config + the existing bot
   health gate). On failure it **re-deploys the last-known-good SHA** (tracked
   in a homelab state file); on success it records the new SHA as good.
3. **Manual one-click rollback.** A `workflow_dispatch` that redeploys a chosen
   prior SHA — for the "deployed healthy but logically broken" case that a
   health check can't catch.
4. **Staged timer reduction.** Cut `wait_timer` 30 → 5 min during a trial; drop
   to 0 once auto-rollback has correctly fired on a real failed deploy.

### Cutover model: recreate-in-place, not blue-green

True blue-green (start-new → verify → swap → stop-old) was rejected:

- The compose uses fixed `container_name`s — two instances of a service can't
  coexist without restructuring.
- **The bot is a single stateful instance with no sharding.** Two bot processes
  = two Discord gateway connections = every command/event handled twice. Blue-
  green is actively unsafe for the bot tier.

So the model is **SHA-pinned recreate-in-place**: `docker compose up -d` swaps
the changed services with a few seconds of reconnect — exactly what every deploy
does today. Safety comes from health-gating + auto-rollback, not from running
two versions side by side.

## Alternatives considered

- **Just shorten the timer (30 → 10).** The ADR's own fallback. Rejected as the
  primary fix: it keeps the passive-bake model, which provides little real
  protection, and still imposes a fixed delay on every change.
- **Blue-green / health-gated cutover.** Rejected — incompatible with the
  stateful single-instance bot and the fixed-container-name compose; large
  restructure for a tier (the bot) that can't use it anyway.
- **Manual rollback only + shorten timer.** Smaller change, but leaves recovery
  human-initiated and keeps a bake window doing little. Chosen as a _subset_
  (manual rollback is included) but not as the whole answer.
- **Reinstating `release/*` buffer.** Already rejected in the prior ADR
  (autosync direction, ceremony-without-bake-time, solo-dev branch orphan risk).

## Consequences

**Positive:**

- merge→live drops from 30+ min to deploy-time for every change.
- Bad deploys are _actively reverted_ (health-gated auto-rollback), not merely
  _delayed_ — strictly stronger than passive bake time.
- SHA-pinned deploys make "what's running" explicit and make rollback a
  first-class, one-command operation.

**Negative:**

- Auto-rollback is new logic that can be wrong (e.g., rolling back on a flaky
  health check). Mitigated by the staged timer cut — a trial window before the
  last guardrail is removed.
- Recreate-in-place keeps the few-seconds reconnect on every deploy (unchanged
  from today; not eliminated).
- Requires a homelab state file for last-known-good SHA; a corrupted/missing
  state file degrades to "report failure, no auto-rollback" (current behavior).

**Neutral:**

- `release.yml` (tag-triggered) is unchanged.
- The `docker-build-check` required PR gate and build-success deploy
  precondition remain — they, not the timer, prevent the broken-image class.

## Failure modes to handle in implementation

- **Rollback target also unhealthy** → stop, alert/page, leave in failed state;
  never loop.
- **No last-known-good yet** (first deploy) → report failure, no auto-rollback.
- **Health check flaky** → bounded retries before declaring failure (deploy.sh
  already retries); tune thresholds during the trial.

## Revisit when

- **2026-07-15**: has auto-rollback fired correctly on a real failed deploy? If
  yes, drop `wait_timer` 5 → 0. If it has produced false rollbacks, raise health
  thresholds before cutting further.
- If deploy frequency or the service set grows enough that recreate downtime
  becomes user-visible: re-evaluate per-tier blue-green for the _web_ tiers
  (backend/frontend/nginx) while keeping the bot on recreate.
- If the bot gains sharding/clustering: blue-green for the bot becomes possible;
  revisit the cutover model.

## Cross-references

- `2026-05-25-release-cadence-gates.md` — introduced the 30-min timer; this ADR
  supersedes the timer portion (the `docker-build-check` gate stands).
- `2026-05-24-deploy-bot-health-gate.md` — the bot health gate feeds the
  health-gated rollback.
- `2026-05-13-deploy-target-keep-homelab.md` — keeps deploys on homelab.
