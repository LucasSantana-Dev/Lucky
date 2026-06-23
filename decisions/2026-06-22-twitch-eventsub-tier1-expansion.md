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
Each event type keeps a dedicated public subscribe function (`subscribeToStreamOnline`,
`subscribeToStreamOffline`, `subscribeToChannelUpdate`, `subscribeToChannelRaid`) and handler
(`handleStreamOnline`, `handleStreamOffline`, `handleChannelUpdate`, `handleChannelRaid`), so
`eventsubClient.ts` can wire and dispatch each independently. To avoid the copy-paste this
otherwise invites, the shared mechanics are factored into two private helpers in
`eventsubSubscriptions.ts`:

- `subscribeToEvent(sessionId, clientId, subscribedIds, type, version, conditionKey)` — the
  single subscription driver (token fetch → distinct broadcaster IDs → `createSubscription`
  per id, tracking the per-event `Set`). The 4 public subscribe functions are thin delegators;
  `channel.raid` passes `conditionKey = 'to_broadcaster_user_id'` for incoming raids.
- `dispatchToChannels(twitchUserId, embed, client)` — the single notification-dispatch path
  (fetch notifications → per-channel null / non-text / DM guards → `channel.send`). The 4
  handlers build only their event-specific embed, then delegate here.

Each event type tracks its own `Set<string>` of subscribed broadcaster IDs in
`eventsubClient.ts` (`subscribedUserIds`, `subscribedOfflineIds`, `subscribedUpdateIds`,
`subscribedRaidIds`); the dispatch branch routes all 4 notification types; `refreshSubscriptions()`
clears and re-subscribes all 4 on reconnect. No Prisma schema change required.

`channel.update` embeds apply a `title || '—'` fallback so an empty stream title cannot make
Discord reject the embed (mirrors the existing `category_name` fallback).

## Consequences

- `eventsubSubscriptions.ts`: 3 new handlers + 3 new subscribe functions, with the shared
  subscribe/dispatch logic extracted into `subscribeToEvent` + `dispatchToChannels` (one place
  to fix per-event behavior — e.g. the title fallback above)
- `eventsubClient.ts`: dispatch branch + import additions + 3 new per-event subscription Sets
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
