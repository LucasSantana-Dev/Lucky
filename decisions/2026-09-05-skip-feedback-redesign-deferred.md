# Skip-reason feedback UX redesign: deferred

- **Date:** 2026-09-05
- **Status:** Accepted (defer)
- **Deciders:** Lucas Santana
- **Scope:** The skip-reason emoji-reaction feedback mechanism on now-playing messages
  (`packages/bot/src/handlers/player/trackNowPlaying.ts:298-312, 359-364`)
- **Closes:** `decisions/2026-08-03-autoplay-remeasure-gate-passed.md` §3, which named this
  redesign as owed and required a separate decision before it could be built or dropped

## Context

`decisions/2026-08-03-autoplay-remeasure-gate-passed.md` measured the emoji-prefill →
reaction skip-feedback pipeline at 2 rows lifetime adoption and concluded, in its Decision
§3, that "the skip-reason feedback UX needs a redesign, not a fix," explicitly deferring
that redesign to "a new, separate decision." No such decision was recorded in the month
since. A search of `decisions/*.md` turns up no mention of skip-reason work, and no open
issue matches "skip feedback" or "redesign" (this ADR's own tracking issue, #2224, is the
follow-up prompt, not a spec).

Verified current state:

- The mechanism is unchanged: `trackNowPlaying.ts` still attaches the same set of
  skip-reason emojis to every now-playing message and logs partial-prefill failures. No
  redesign work has landed.
- Autoplay's other metrics have held or improved since the 2026-08-03 measurement
  (`decisions/2026-08-03-autoplay-remeasure-gate-passed.md`: coverage 75.6% -> 83.4%,
  acceptance holding at 0.950), so autoplay quality is not blocked on this signal.
- #2227 is open and ready-for-agent: it will surface `getSummary` /
  `getPerSourceAcceptance` (the acceptance/coverage numbers three ADRs have relied on via
  raw SQL) on the dashboard's Music page. Once that ships, it is the natural place to
  observe whether skip-reason adoption moves at all, and the natural place to eventually
  host a redesigned feedback control if one is ever built.
- Nothing else in the codebase reads or writes skip-reason data beyond the reaction
  handler; there is no partial redesign in flight to reconcile.

## Decision

**Defer the skip-reason feedback UX redesign. Keep the existing emoji-reaction mechanism
as-is.** Two rows of lifetime data is not enough to design against, and no one has spent
design time on a replacement since the 2026-08-03 ADR flagged the need. Building a redesign
now would be speculative: the shape of a better mechanism should come from watching
real usage once that usage is visible in the dashboard (#2227), not from guessing.

This ADR is the "separate decision" the 2026-08-03 ADR asked for. It satisfies that ADR's
owed follow-up by explicitly re-deferring, with the revisit condition below, rather than
leaving the debt unrecorded.

## Alternatives considered

- **Redesign now** (e.g. a slash-command prompt, a dashboard form, a DM follow-up),
  rejected. Two lifetime data points give no signal about what form of feedback users
  would actually engage with; any design would be a guess dressed up as a decision.
- **Remove the mechanism entirely**, rejected. It is inert (near-zero adoption, no
  reported user complaints, negligible maintenance cost) and removing it would also
  remove the one channel, however underused, through which skip-reason data could ever
  accumulate. There is no cost pressure forcing removal.
- **Leave the debt unrecorded**, rejected. That is the exact failure #2224 exists to
  close; the 2026-08-03 ADR was explicit that a redesign or a re-defer both count as
  resolving it, and only a recorded decision satisfies that, not silence.

## Consequences

- **Positive:** the owed-decision debt from 2026-08-03 is closed; the mechanism is not
  touched, so there is zero implementation risk; future work has an explicit revisit
  condition instead of an open-ended "someday."
- **Negative:** skip-reason adoption stays at effectively zero until either the revisit
  condition fires or someone observes a concrete reason to act sooner; the signal
  continues to be functionally unused.
- **Neutral:** the emoji-reaction code path is unchanged, so no test or behavior surface
  is affected by this decision.

## Revisit when

- #2227 ships and dashboard-visible autoplay acceptance telemetry from
  `/api/guilds/:guildId/recommendations/history` shows skip-reason adoption still below a
  meaningful threshold (e.g. under 5% of skipped tracks getting a reaction) over a rolling
  30-day window, at which point the low adoption itself becomes the evidence a redesign
  should act on; or
- Someone proposes a concrete redesign with a spec, in which case that spec supersedes this
  ADR and becomes the new decision record (#2227's dashboard view is the natural place to
  host it); or
- Skip-reason data is needed for an autoplay quality decision and the near-zero volume
  becomes a blocker, forcing the redesign question sooner than either trigger above.
