# Idempotency posture: targeted dedup at evidenced sites + a house pattern, no blanket protocol

- Status: accepted
- Date: 2026-06-12

## Context

A review of every mutation surface (backend routes, bot interaction/event handlers, automation apply, webhooks, scrobbling, snapshots) asked where duplicate or retried requests could double-mutate state. Findings, after adversarial verification:

- Most surfaces are **already idempotent** by construction: Prisma `upsert` on natural keys (GuildSettings, TwitchNotification), P2002 retry loop (ModerationCase), atomic Redis dedup with `duplicate: true` response (top.gg vote webhook), single-use snapshots (music session restore), server-side timestamp dedup (Last.fm scrobbles), capture/diff semantics (guild automation re-apply).
- Three real gaps: support-report intake has no dedup key and double-pings staff (#1319); custom-command and embed-template creates surface the DB's `@@unique` guard as a P2002 _error_ instead of idempotent success (#1320); ReactionRolesService toggle has a low-stakes read-then-write race (logged on #1199).
- Several scarier-sounding findings did **not** survive verification: the support form already disables submit in flight; Discord does not redeliver button interactions (each click is a distinct interaction id, so interaction-id dedup would not even address double-clicks); React Query does not auto-retry mutations.
- Deployment is a single homelab instance; Redis is being decommissioned to music pub/sub only; there are no payments, no public API consumers, and no multi-instance plans.

## Decision

1. **No blanket `Idempotency-Key` middleware or dedup table.** At this scale it is infrastructure for a problem that has not manifested; the simplicity-first rule wins.
2. **Targeted fixes at the verified sites only**, delivered through the normal serial fix queue: #1319 (support intake dedup key + at-most-once staff ping), #1320 (P2002-on-natural-key → return the existing row).
3. **House pattern, applied on touch** (this ADR is the committed standard):
    - Mutations keyed by a natural identity use `upsert` or treat P2002 on that key as **idempotent success**, never a user-facing error.
    - Intakes with non-transactional side effects (Discord pings, emails) carry a client-generated submission id used as a dedup key before the side effect fires.
    - Get-or-create is always `upsert`, never find-then-create (#1199's bug class).
    - Set-to-value beats increment/toggle where the domain allows it; toggles that must read state document the race or take a row-level guard.
    - Webhook intakes dedup by delivery/event id and answer replays with `200 { duplicate: true }` (the top.gg handler is the reference implementation).

## Alternatives considered

- **A — blanket `Idempotency-Key` header + dedup table for all mutating routes:** rejected — high build/maintenance cost, near-zero marginal protection given how many surfaces are already guarded, and it still would not cover bot-side flows (Discord events have no client header).
- **C — DB-constraints-only:** rejected as the _whole_ answer — cannot dedup side effects that fire outside the transaction (staff pings).
- **D — client-side-only (disable buttons, no retries):** already largely in place; rejected as the whole answer because it is defenseless against manual resubmits and webhook redelivery.
- **F — pg advisory locks around mutating flows:** rejected — locks serialize, they don't dedup; wrong tool for replays. (Existing transaction-scoped advisory locks in CustomCommand/AutoMessage upserts stay — different job.)

## Consequences

- Positive: two small PRs close the real gaps; the pattern costs nothing until a new mutation surface is written; no new infrastructure to operate.
- Negative: no uniform replay protocol — each new side-effectful intake must remember the pattern (this ADR + review checklist is the only enforcement).
- Neutral: the reaction-role toggle race is accepted as-is at current scale (documented on #1199).

## Revisit when

- The bot/API goes **multi-instance** (in-memory locks and caches stop being guards) → re-evaluate a shared dedup store.
- **Payments or any money-moving flow** is added → that flow gets a real idempotency-key protocol regardless of scale.
- A **public API consumer** (third-party callers with retries) appears → revisit the header protocol for the public surface.
- An incident postmortem shows a retry storm or duplicate-mutation as root cause → re-open with data.
