# Twitch EventSub Tier 1 Expansion: stream.offline, channel.update, channel.raid

- Status: accepted
- Date: 2026-06-22
- Method: /adt-research (codebase + Twitch EventSub docs + competitor analysis) → /feature-from-zero

## Context

Lucky's Twitch integration currently uses one EventSub event: `stream.online`. The WebSocket
client supports up to 300 concurrent subscriptions and is already connected and reconnecting
on drop. The existing pattern (`subscribeToStreamOnline` → `handleStreamOnline`) is replicated
cleanly in `eventsubSubscriptions.ts`.

Research across four angles (codebase, Twitch EventSub official docs, Streamcord/MEE6
competitor analysis, community context) found:

- **Stream.online is one of 50+ event types** — Lucky uses 1.
- **Three events require no new OAuth scope**: `stream.offline`, `channel.update`, `channel.raid`.
- **Criativaria** (primary Lucky community, PT-BR tech/coding, already seeded with `stream.online`
  via `/serversetup criativaria`) is the primary beneficiary. Criativaria streams coding sessions
  where stream title/category changes frequently.
- Streamcord (1M+ users) ships stream.offline and raid as part of its free tier.

Tier 2 events (subscriptions, followers, bits, channel points) require a broadcaster-scoped
OAuth token that Lucky's current flow doesn't collect. This is a separate decision.

## Decision

Implement Tier 1 EventSub expansion in a single PR:

**1. `stream.offline` v1**

- Condition: `broadcaster_user_id` (same as stream.online — no new auth)
- Action: post "stream ended" embed to the configured Discord channel
- Rationale: completes the online/offline lifecycle; gaps in Streamcord free tier close

**2. `channel.update` v2**

- Condition: `broadcaster_user_id` (no broadcaster scope needed in v2)
- Action: post "stream updated" embed showing new title + category
- Rationale: Criativaria streams coding sessions with frequent title/category changes; v2
  removes the broadcaster-token requirement that blocked v1

**3. `channel.raid` v1**

- Condition: `to_broadcaster_user_id` (incoming raids)
- Action: post raid announcement embed ("X viewers from @streamer incoming!")
- Rationale: highest engagement event on Twitch; no auth needed for incoming-raid detection

**Architecture approach:**
Refactor `subscribeToStreamOnline` into `subscribeToAllEvents` that atomically subscribes
all 4 event types per broadcaster in a single pass. The `subscribedUserIds` set continues
to track which broadcasters have been fully subscribed. `eventsubClient.ts` dispatch branch
expanded with 3 new event types. No Prisma schema change required.

## Consequences

- `eventsubSubscriptions.ts`: ~80 new lines; 3 new subscribe calls + 3 handlers
- `eventsubClient.ts`: ~15 new lines; dispatch branch + import additions
- No DB migration, no new OAuth scope, no new environment variables
- `refreshSubscriptions()` transparently subscribes all 4 events on reconnect

## Deferred (Tier 2)

Subscriber events (`channel.subscribe`, `channel.subscription.gift`, `channel.subscription.message`),
follower events (`channel.follow` v2), and bits events (`channel.cheer`) require a
broadcaster-scoped access token. Defer to a separate ADR + broadcaster OAuth flow PR.

## Revisit

If Criativaria requests PT-BR embed strings: add i18n layer keyed to guild language setting.
If `channel.update` fires too frequently (title changes every few minutes): add a debounce
(min 5 min between Discord posts per broadcaster). Revisit when shipping Tier 2.
