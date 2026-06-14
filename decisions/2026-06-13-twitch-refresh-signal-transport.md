# Backend→bot Twitch refresh signal: dedicated TwitchControlService, not a shared bus (yet)

- Status: accepted
- Date: 2026-06-13

## Context

PR #1399 fixes #870: a Twitch channel added/removed through the web dashboard
was written to Postgres but never registered on the running bot, so no
`stream.online` EventSub subscription was created until the next bot restart.
The fix needs the backend to signal the running bot to call
`refreshTwitchSubscriptions()` after a dashboard add/remove.

The codebase already has exactly one cross-process control channel:
`MusicControlService` (Redis pub/sub), the one Redis use intentionally kept
after the KV→Postgres scope reduction (`2026-05-31-redis-scope-reduction`).
Both backend and bot already hold a `musicControlService` publisher+subscriber
connection pair. The question: what transport should the Twitch refresh signal
use?

## Decision

Add a **dedicated `TwitchControlService`** in `@lucky/shared/services` — its own
publisher/subscriber Redis pair, one channel (`twitch:refresh`), `publishRefresh()`
on the backend, `subscribeToRefresh()` on the bot — mirroring
`MusicControlService`. Fire-and-forget: if Redis is down the row still lands in
Postgres and the bot picks it up on restart, so a failed publish never fails the
request.

The "Redis = pub/sub only" posture is preserved: a refresh signal is pub/sub, not
KV/cache, so this is within the spirit of the scope-reduction ADR, not a
regression of it.

## Alternatives considered

- **Reuse the existing `musicControlService` connections** (an ioredis subscriber
  can multiplex channels). Rejected: couples Twitch notifications to a
  music-named, load-bearing service — a future music-pubsub refactor would
  silently break Twitch — to save two idle subscriber sockets, which Redis
  handles trivially. Concern-mixing cost > socket saving.
- **Generic `ControlBusService`** that both music and Twitch ride. Rejected _for
  now_: its promised win (one connection pair, no per-feature boilerplate) is
  undercut because music's channel is **not pure pub/sub** — it carries
  request/reply with correlation IDs and timeouts (`pendingResults`,
  `sendCommand`). A generic bus can't subsume that cleanly, so music keeps its
  bespoke service anyway and the bus becomes a _third_ abstraction rather than a
  unifying one. Premature at N=2 signals. This is the option to adopt at the
  revisit trigger below.
- **HTTP call backend→bot.** Rejected: the bot is a Discord gateway client with no
  HTTP ingress today; this adds a new server surface, auth, and backend↔bot
  reachability concerns that Redis pub/sub already solves. Strictly heavier.

## Consequences

- Positive: minimal, reviewer-recognizable, isolated lifecycle and tests; matches
  the established pattern; no change to the working music path.
- Negative: a second copy of the `connect/disconnect/isHealthy` boilerplate, and
  two extra Redis connections (one publisher on the backend, one subscriber on the
  bot) for a 1-byte signal.
- Neutral: the boilerplate duplication is the explicit cost we accept to avoid a
  premature abstraction.

## Revisit when

A **third** dedicated control-signal service is proposed. At that point extract the
shared `connect/disconnect/isHealthy` boilerplate into a small base (or the generic
bus) and migrate all three together — deferring the abstraction until there is real
evidence of the third consumer, not a speculative one. Also revisit if Redis
connection count ever becomes an actual operational constraint.

## References

- PR #1399 — `fix(twitch): refresh bot subscriptions on web add/remove (#870)`
- `packages/shared/src/services/twitch/TwitchControlService.ts`
- `packages/shared/src/services/music/MusicControlService.ts` (mirrored pattern)
- `decisions/2026-05-31-redis-scope-reduction.md` (Redis = pub/sub only posture)
