# Channel cleanup (#1687) — ship purge-only v1 with mandatory guards

- **Date:** 2026-07-12
- **Status:** Accepted
- **Deciders:** Lucas Santana
- **Method:** 5-lens `/debate` (safety, feasibility, product, pragmatism, ops) — Round 1 split
  (ship-with-guards ×3, defer ×2) → Round 2 all five converged to **ship-with-guards**
- **Supersedes (partially):** `decisions/2026-07-11-channel-ttl-delete-mechanism.md` — TTL mode
  is deferred (see below); that ADR's dual setTimeout+sweep design is parked for v2 (#1813).

## Context

PR #1687 adds automatic channel cleanup to the Lucky bot — an **irreversible, destructive**
feature (it deletes user messages). The repo's destructive-interaction gate
(`decisions/2026-06-21-destructive-interaction-merge-gate.md`) classifies it Tier-A and blocks
merge without a live-smoke attestation. Lucky serves ~11 guilds including Criativaria (a
belonging/inclusion community); prod = homelab, merge-to-main = prod deploy, single-container.

Original PR shipped two modes: `purge_interval` (5-min tick, bulk-delete) and `ttl` (delete
each message N seconds after posting, via per-message in-memory `setTimeout`). It had **no
audit-logging of deletions**, no dry-run, and no documented community request.

## Decision

**Ship, with mandatory guards** (all five debate lenses converged):

1. **Audit-logging is mandatory and PRE-MERGE, not fast-follow.** Every purge writes a
   `ServerLog` entry (guild, channel, deleted count, configId). An irreversible destructive op
   in a trust-dependent community needs a day-1 forensic trail; retrofitting leaves a gap +
   operator liability. (Implemented on `feat/channel-cleanup`.)
2. **Scope v1 to `purge_interval` only; defer TTL to v2** (issue #1813). The per-message
   `setTimeout` design has unproven restart-durability and poor scale (revisit at ~10k pending
   timers); it is orthogonal to the durable DB-backed purge sweep. The `ChannelCleanupConfig.mode`
   field is kept for v2 reuse.
3. **Existing admin guards are sound and retained:** `ManageGuild` command gate, bot-ManageMessages
   check, starboard-block, per-config guild verification, retry-on-failure.
4. **Merge gate = operator live-smoke (45 min, incl. restart-durability)** on a Criativaria test
   channel, then tick the destructive-gate attestation.
5. **Rollout: canary Criativaria 24h → then the other guilds** — empirical community consent +
   rollback beats hypothetical polling.

## Alternatives considered

- **Ship both modes as-is now (pragmatism R1: audit-log fast-follow):** rejected — audit-log
  fast-follow leaves an irreversible op untraceable on day 1; TTL durability unproven.
- **Defer the whole feature until a guild requests it (product R1):** rejected — the
  Criativaria-first canary provides empirical consent + rollback, stronger than pre-approval,
  and the admin gate + audit-log + opt-in-per-channel already satisfy inclusion principles.
- **30-min smoke (enable/disable + restart):** rejected — feasibility flagged it doesn't verify
  pending-delete survival across restart; expanded to 45 min.

## Consequences

- **Positive:** every deletion is traceable; blast radius contained (admin-gated, canary-first);
  the risky TTL design is deferred behind a proper v2 redesign rather than shipped unproven.
- **Negative:** TTL (auto-expire messages) not available until v2; operator must perform a live
  smoke before merge (by design — the gate).
- **Neutral:** `mode` field + any inert `ttl` DB configs coexist harmlessly until v2.

## Revisit when

- **TTL v2 (#1813):** ships with durable (DB-backed, restart-proven) scheduling, no per-message
  DB round-trip (folds in #1798), audit-logging, and its own live-smoke.
- Re-open the audit-log/canary posture if the destructive-gate policy itself changes.
